import { BadRequestException, ConflictException } from '@nestjs/common';

import {
  assertCanJoin,
  assertCanQueue,
  canTransition,
  parseTimeControl,
} from './rules';

describe('join rules', () => {
  it('allows joining an open tournament once', () => {
    expect(() => assertCanJoin('open', false)).not.toThrow();
    expect(() => assertCanJoin('open', true)).toThrow(ConflictException);
  });

  it.each(['draft', 'ongoing', 'completed'] as const)(
    'rejects joining a %s tournament',
    (status) => {
      expect(() => assertCanJoin(status, false)).toThrow(BadRequestException);
    },
  );
});

describe('queue rules', () => {
  it('requires participation and an open/ongoing tournament', () => {
    expect(() => assertCanQueue('open', true)).not.toThrow();
    expect(() => assertCanQueue('ongoing', true)).not.toThrow();
    expect(() => assertCanQueue('ongoing', false)).toThrow(BadRequestException);
    expect(() => assertCanQueue('draft', true)).toThrow(BadRequestException);
    expect(() => assertCanQueue('completed', true)).toThrow(
      BadRequestException,
    );
  });
});

describe('status transitions', () => {
  it('only moves forward', () => {
    expect(canTransition('draft', 'open')).toBe(true);
    expect(canTransition('open', 'ongoing')).toBe(true);
    expect(canTransition('ongoing', 'completed')).toBe(true);
    expect(canTransition('completed', 'open')).toBe(false);
    expect(canTransition('ongoing', 'draft')).toBe(false);
  });
});

describe('parseTimeControl', () => {
  it('parses base+increment', () => {
    expect(parseTimeControl('5+0')).toEqual({
      baseMinutes: 5,
      incrementSeconds: 0,
    });
    expect(parseTimeControl('10+5')).toEqual({
      baseMinutes: 10,
      incrementSeconds: 5,
    });
  });
  it('rejects garbage', () => {
    expect(() => parseTimeControl('abc')).toThrow(BadRequestException);
    expect(() => parseTimeControl('0+3')).toThrow(BadRequestException);
  });
});
