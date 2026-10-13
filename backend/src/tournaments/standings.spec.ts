import { computeStandings, pointsFor } from './standings';

const players = [
  { userId: 'a', name: 'Asha' },
  { userId: 'b', name: 'Bhavya' },
  { userId: 'c', name: 'Chetan' },
];

describe('pointsFor', () => {
  it('scores win=1, draw=0.5, loss=0', () => {
    expect(pointsFor('white', 'white')).toBe(1);
    expect(pointsFor('white', 'black')).toBe(0);
    expect(pointsFor('draw', 'white')).toBe(0.5);
    expect(pointsFor('draw', 'black')).toBe(0.5);
  });
});

describe('computeStandings', () => {
  it('ranks by points and counts W/D/L', () => {
    const rows = computeStandings(players, [
      { whiteId: 'a', blackId: 'b', result: 'white' },
      { whiteId: 'b', blackId: 'c', result: 'draw' },
      { whiteId: 'c', blackId: 'a', result: 'black' },
    ]);
    expect(rows.map((r) => [r.userId, r.points, r.rank])).toEqual([
      ['a', 2, 1],
      ['b', 0.5, 2],
      ['c', 0.5, 2],
    ]);
    expect(rows[0]).toMatchObject({ played: 2, wins: 2, losses: 0 });
    expect(rows[1]).toMatchObject({ played: 2, draws: 1, losses: 1 });
  });

  it('includes participants with no games at zero', () => {
    const rows = computeStandings(players, []);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.points === 0 && r.rank === 1)).toBe(true);
  });

  it('breaks points ties by wins, then Sonneborn-Berger', () => {
    // a: 1W 1L (1pt), b: 2 draws (1pt) -> a ranks above b on wins
    const rows = computeStandings(
      [...players, { userId: 'd', name: 'Dev' }],
      [
        { whiteId: 'a', blackId: 'c', result: 'white' },
        { whiteId: 'd', blackId: 'a', result: 'white' },
        { whiteId: 'b', blackId: 'c', result: 'draw' },
        { whiteId: 'b', blackId: 'd', result: 'draw' },
      ],
    );
    const a = rows.find((r) => r.userId === 'a')!;
    const b = rows.find((r) => r.userId === 'b')!;
    expect(a.points).toBe(b.points);
    expect(a.rank).toBeLessThan(b.rank);
  });

  it('ignores matches involving unknown players', () => {
    const rows = computeStandings(players, [
      { whiteId: 'a', blackId: 'zzz', result: 'white' },
    ]);
    expect(rows.find((r) => r.userId === 'a')!.points).toBe(1);
  });
});
