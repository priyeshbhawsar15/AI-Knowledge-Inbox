import { execSync } from 'node:child_process';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ItemDetailResponse {
  id: string;
  status: string;
  chunkCount: number;
  displayContent?: string | null;
}

interface IngestResponse {
  item: {
    id: string;
    status: string;
  };
  jobId: string;
}

async function waitForHealthReady(maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch('http://127.0.0.1:3000/health/ready');
      if (res.ok) {
        const body = (await res.json()) as { status: string };
        if (body.status === 'ok') {
          console.log('[Compose Pipeline Test] API readiness verified:', JSON.stringify(body));
          return true;
        }
      }
    } catch {
      // Stack warming up
    }
    await sleep(2000);
  }
  throw new Error('API /health/ready failed to become ready within timeout');
}

async function runPipeline() {
  console.log('[Compose Pipeline Test] Cleaning up existing test stack...');
  execSync('docker compose -f docker-compose.test.yml down -v', { stdio: 'inherit' });

  try {
    console.log('[Compose Pipeline Test] Starting test stack with docker compose...');
    execSync('docker compose -f docker-compose.test.yml up -d --build', { stdio: 'inherit' });

    console.log('[Compose Pipeline Test] Waiting for stack readiness...');
    await waitForHealthReady();

    // POST text note
    console.log('[Compose Pipeline Test] Ingesting text note...');
    const textRes = await fetch('http://127.0.0.1:3000/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'text',
        title: 'Compose Pipeline Note',
        content: 'SQLite WAL mode facilitates high performance reads and writes in AI Knowledge Inbox.',
      }),
    });
    if (!textRes.ok) {
      const errText = await textRes.text();
      throw new Error(`Text ingest failed with status ${textRes.status}: ${errText}`);
    }
    const textData = (await textRes.json()) as IngestResponse;
    const textItemId = textData.item.id;
    console.log(`[Compose Pipeline Test] Text note created with ID: ${textItemId}`);

    // POST URL note
    console.log('[Compose Pipeline Test] Ingesting URL note...');
    const urlRes = await fetch('http://127.0.0.1:3000/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'url',
        url: 'http://fake-services:8081/fixture-article.html',
      }),
    });
    if (!urlRes.ok) {
      const errText = await urlRes.text();
      throw new Error(`URL ingest failed with status ${urlRes.status}: ${errText}`);
    }
    const urlData = (await urlRes.json()) as IngestResponse;
    const urlItemId = urlData.item.id;
    console.log(`[Compose Pipeline Test] URL note created with ID: ${urlItemId}`);

    // Poll until both are ready
    console.log('[Compose Pipeline Test] Polling items until ready...');
    let textReady = false;
    let urlReady = false;
    let textItemInfo: ItemDetailResponse | null = null;
    let urlItemInfo: ItemDetailResponse | null = null;

    const pollStart = Date.now();
    while (Date.now() - pollStart < 30000) {
      if (!textReady) {
        const res = await fetch(`http://127.0.0.1:3000/items/${textItemId}`);
        if (res.ok) {
          textItemInfo = (await res.json()) as ItemDetailResponse;
          if (textItemInfo.status === 'ready') textReady = true;
        }
      }
      if (!urlReady) {
        const res = await fetch(`http://127.0.0.1:3000/items/${urlItemId}`);
        if (res.ok) {
          urlItemInfo = (await res.json()) as ItemDetailResponse;
          if (urlItemInfo.status === 'ready') urlReady = true;
        }
      }
      if (textReady && urlReady) break;
      await sleep(1000);
    }

    if (!textReady || !urlReady || !textItemInfo || !urlItemInfo) {
      throw new Error(
        `Items failed to reach ready state. Text: ${textItemInfo?.status}, URL: ${urlItemInfo?.status}`
      );
    }

    console.log(
      `[Compose Pipeline Test] Text item ready with ${textItemInfo.chunkCount} chunks`
    );
    console.log(
      `[Compose Pipeline Test] URL item ready with ${urlItemInfo.chunkCount} chunks`
    );

    if (textItemInfo.chunkCount === 0 || urlItemInfo.chunkCount === 0) {
      throw new Error('Persisted chunk count is zero for one or more items!');
    }

    // Query 1
    console.log('[Compose Pipeline Test] Querying API before restart...');
    const q1Res = await fetch('http://127.0.0.1:3000/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is SQLite WAL mode?' }),
    });
    if (!q1Res.ok) {
      const errText = await q1Res.text();
      throw new Error(`Query 1 failed with status ${q1Res.status}: ${errText}`);
    }
    const q1Data = (await q1Res.json()) as { answer: string; sources: Array<{ itemId: string }> };
    console.log('[Compose Pipeline Test] Query 1 Answer:', q1Data.answer);
    console.log(
      '[Compose Pipeline Test] Query 1 Citations:',
      q1Data.sources.map((s) => s.itemId)
    );

    if (!q1Data.answer || q1Data.sources.length === 0) {
      throw new Error('Query 1 returned empty answer or zero citations');
    }

    // Restart API and worker containers without deleting volume
    console.log(
      '[Compose Pipeline Test] Restarting API and worker containers (preserving volume)...'
    );
    execSync('docker compose -f docker-compose.test.yml restart api worker', { stdio: 'inherit' });

    console.log('[Compose Pipeline Test] Waiting for stack readiness after container restart...');
    await waitForHealthReady();

    // Verify items and chunks persisted
    console.log('[Compose Pipeline Test] Verifying items after container restart...');
    const postRestartTextRes = await fetch(`http://127.0.0.1:3000/items/${textItemId}`);
    const postRestartTextData = (await postRestartTextRes.json()) as ItemDetailResponse;

    const postRestartUrlRes = await fetch(`http://127.0.0.1:3000/items/${urlItemId}`);
    const postRestartUrlData = (await postRestartUrlRes.json()) as ItemDetailResponse;

    console.log(
      `[Compose Pipeline Test] Post-restart Text item status: ${postRestartTextData.status}, chunks: ${postRestartTextData.chunkCount}`
    );
    console.log(
      `[Compose Pipeline Test] Post-restart URL item status: ${postRestartUrlData.status}, chunks: ${postRestartUrlData.chunkCount}`
    );

    if (
      postRestartTextData.status !== 'ready' ||
      postRestartTextData.chunkCount !== textItemInfo.chunkCount ||
      postRestartUrlData.status !== 'ready' ||
      postRestartUrlData.chunkCount !== urlItemInfo.chunkCount
    ) {
      throw new Error('Post-restart state check failed: item status or chunk counts mismatch!');
    }

    // Query 2 after restart -> proves API vector-index rebuild on startup
    console.log(
      '[Compose Pipeline Test] Querying API after restart (verifying vector-index rebuild)...'
    );
    const q2Res = await fetch('http://127.0.0.1:3000/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is SQLite WAL mode?' }),
    });
    if (!q2Res.ok) {
      const errText = await q2Res.text();
      throw new Error(`Query 2 failed with status ${q2Res.status}: ${errText}`);
    }
    const q2Data = (await q2Res.json()) as { answer: string; sources: Array<{ itemId: string }> };
    console.log('[Compose Pipeline Test] Query 2 Answer:', q2Data.answer);
    console.log(
      '[Compose Pipeline Test] Query 2 Citations:',
      q2Data.sources.map((s) => s.itemId)
    );

    if (!q2Data.answer || q2Data.sources.length === 0) {
      throw new Error('Query 2 returned empty answer or zero citations after restart');
    }

    console.log(
      '[Compose Pipeline Test] SUCCESS! Compose pipeline persistence & index rebuild test passed.'
    );
  } finally {
    console.log('[Compose Pipeline Test] Cleaning up docker compose test stack...');
    execSync('docker compose -f docker-compose.test.yml down -v', { stdio: 'inherit' });
  }
}

runPipeline().catch((err) => {
  console.error('[Compose Pipeline Test] FATAL ERROR:', err);
  process.exit(1);
});
