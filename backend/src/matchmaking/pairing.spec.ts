import { findPair, type Waiting } from './pairing';

const w = (userId: string, joinedAt: number, points = 0): Waiting => ({
  userId,
  joinedAt,
  points,
});
const any = () => true;

describe('findPair', () => {
  it('returns null with fewer than two eligible players', () => {
    expect(findPair([], any)).toBeNull();
    expect(findPair([w('a', 1)], any)).toBeNull();
  });

  it('pairs FIFO when points are equal', () => {
    const pair = findPair([w('a', 1), w('b', 2), w('c', 3)], any)!;
    expect(pair.map((p) => p.userId)).toEqual(['a', 'b']);
  });

  it('prefers the closest-ranked opponent', () => {
    const pair = findPair([w('a', 1, 3), w('b', 2, 0), w('c', 3, 2.5)], any)!;
    expect(pair.map((p) => p.userId).sort()).toEqual(['a', 'c']);
  });

  it('skips pairs that are not allowed to play (already met)', () => {
    const met = (x: string, y: string) => !(x === 'a' && y === 'b');
    const pair = findPair([w('a', 1), w('b', 2), w('c', 3)], met)!;
    expect(pair.map((p) => p.userId)).toEqual(['a', 'c']);
    expect(findPair([w('a', 1), w('b', 2)], met)).toBeNull();
  });
});
