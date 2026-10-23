import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getContractIdentityKey } = require('./contract-identity');

describe('contract identity', () => {
  it('is deterministic for the same expediente and organism', () => {
    expect(getContractIdentityKey('12/2022 Patrimonial', 'Ayuntamiento de Alcázar de San Juan'))
      .toBe(getContractIdentityKey('12/2022 Patrimonial', 'Ayuntamiento de Alcázar de San Juan'));
  });

  it('separates contracts that share a PLACSP source id', () => {
    expect(getContractIdentityKey('12/2022 Patrimonial', 'Ayuntamiento de Alcázar de San Juan'))
      .not.toBe(getContractIdentityKey('3/2023 Patrimonial', 'Ayuntamiento de Alcázar de San Juan'));
  });

  it('separates the same expediente across different organisms', () => {
    expect(getContractIdentityKey('1/2023', 'Ayuntamiento de Alcázar de San Juan'))
      .not.toBe(getContractIdentityKey('1/2023', 'Aguas de Alcázar'));
  });
});
