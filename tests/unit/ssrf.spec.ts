import { describe, it, expect } from 'vitest';
import { validateUrlAndResolveIp, isPrivateOrReservedIp } from '../../packages/ingestion/src/ssrf.js';

describe('SSRF Protection & Address Validation', () => {
  it('identifies private and reserved IP addresses correctly', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true);
    expect(isPrivateOrReservedIp('172.20.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.100')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false);
  });

  it('blocks loopback, private IPs, and localhost destinations by default', async () => {
    await expect(validateUrlAndResolveIp('http://127.0.0.1')).rejects.toThrow(/URL_PRIVATE_ADDRESS/);
    await expect(validateUrlAndResolveIp('http://10.0.0.1')).rejects.toThrow(/URL_PRIVATE_ADDRESS/);
    await expect(validateUrlAndResolveIp('http://169.254.169.254')).rejects.toThrow(/URL_PRIVATE_ADDRESS/);
    await expect(validateUrlAndResolveIp('http://localhost')).rejects.toThrow(/URL_PRIVATE_ADDRESS/);
  });

  it('rejects credentials in URLs', async () => {
    await expect(validateUrlAndResolveIp('http://admin:secret@example.com')).rejects.toThrow(/Credentials/);
  });

  it('rejects non-standard ports in non-test mode', async () => {
    await expect(validateUrlAndResolveIp('http://example.com:8080')).rejects.toThrow(/Non-standard port/);
  });

  it('allows exact allowlisted host in NODE_ENV=test while blocking non-allowlisted private hosts', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'test';
      const result = await validateUrlAndResolveIp('http://127.0.0.1:8081/fixture-article.html', {
        allowlistedHosts: ['127.0.0.1'],
      });
      expect(result.resolvedIp).toBe('127.0.0.1');

      // Non-allowlisted private target must remain blocked in test mode
      await expect(
        validateUrlAndResolveIp('http://10.0.0.1:8081/secret', {
          allowlistedHosts: ['127.0.0.1'],
        })
      ).rejects.toThrow(/URL_POLICY_VIOLATION: Non-standard port/);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('requires NODE_ENV=test for test allowlist option', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      await expect(
        validateUrlAndResolveIp('http://127.0.0.1:3000', { allowLocalhostInTests: true, allowlistedHosts: ['127.0.0.1'] })
      ).rejects.toThrow(/URL_POLICY_VIOLATION: Non-standard port/);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
