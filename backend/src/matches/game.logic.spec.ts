import {
  applyMove,
  currentClocks,
  flagged,
  initialState,
  type GameState,
} from './game.logic';

const T0 = 1_000_000;
const fresh = (): GameState => initialState(5, 0, T0);

function play(state: GameState, moves: [string, string][], start = T0) {
  let s = state;
  let t = start;
  moves.forEach(([from, to], i) => {
    const r = applyMove(s, i % 2 === 0 ? 'white' : 'black', { from, to }, t);
    if (!r.ok) throw new Error(`${from}${to}: ${r.error}`);
    s = r.state;
    t += 1000;
  });
  return s;
}

describe('move / turn validation', () => {
  it('accepts a legal move and flips the turn', () => {
    const r = applyMove(fresh(), 'white', { from: 'e2', to: 'e4' }, T0 + 500);
    expect(r).toMatchObject({ ok: true, san: 'e4' });
    if (r.ok) {
      expect(r.state.pgn).toBe('1. e4');
      expect(r.state.fen.split(' ')[1]).toBe('b');
    }
  });

  it('rejects a move out of turn', () => {
    expect(applyMove(fresh(), 'black', { from: 'e7', to: 'e5' }, T0)).toEqual({
      ok: false,
      error: 'Not your turn',
    });
  });

  it('rejects illegal moves', () => {
    expect(applyMove(fresh(), 'white', { from: 'e2', to: 'e5' }, T0)).toEqual({
      ok: false,
      error: 'Illegal move',
    });
  });

  it('rejects moving after the game ended', () => {
    const s = { ...fresh(), turnStartedAt: null };
    expect(applyMove(s, 'white', { from: 'e2', to: 'e4' }, T0)).toMatchObject({
      ok: false,
    });
  });

  it("detects fool's mate as a black win by checkmate", () => {
    const s = fresh();
    let state = s;
    const moves: [string, string][] = [
      ['f2', 'f3'],
      ['e7', 'e5'],
      ['g2', 'g4'],
      ['d8', 'h4'],
    ];
    let last;
    moves.forEach(([from, to], i) => {
      last = applyMove(
        state,
        i % 2 === 0 ? 'white' : 'black',
        { from, to },
        T0 + i,
      );
      if (!last.ok) throw new Error(last.error);
      state = last.state;
    });
    expect(last).toMatchObject({
      ok: true,
      outcome: { result: 'black', reason: 'checkmate' },
    });
    expect(state.turnStartedAt).toBeNull();
  });

  it('detects stalemate as a draw', () => {
    // Classic quickest stalemate (Sam Loyd, 10 moves).
    const seq =
      'e2e3 a7a5 d1h5 a8a6 h5a5 h7h5 h2h4 a6h6 a5c7 f7f6 c7d7 e8f7 d7b7 d8d3 b7b8 d3h7 b8c8 f7g6 c8e6';
    let state = fresh();
    let last;
    seq.split(' ').forEach((m, i) => {
      last = applyMove(
        state,
        i % 2 === 0 ? 'white' : 'black',
        { from: m.slice(0, 2), to: m.slice(2, 4) },
        T0 + i,
      );
      if (!last.ok) throw new Error(`${m}: ${last.error}`);
      state = last.state;
    });
    expect(last).toMatchObject({
      outcome: { result: 'draw', reason: 'stalemate' },
    });
  });

  it('detects threefold repetition', () => {
    const shuffle: [string, string][] = [
      ['g1', 'f3'],
      ['g8', 'f6'],
      ['f3', 'g1'],
      ['f6', 'g8'],
    ];
    const s = play(fresh(), [...shuffle, ...shuffle.slice(0, 3)]);
    const r = applyMove(s, 'black', { from: 'f6', to: 'g8' }, T0 + 99_000);
    expect(r).toMatchObject({
      ok: true,
      outcome: { result: 'draw', reason: 'repetition' },
    });
  });
});

describe('clock', () => {
  it('deducts elapsed time from the side to move only', () => {
    const c = currentClocks(fresh(), T0 + 10_000);
    expect(c).toEqual({ whiteMs: 290_000, blackMs: 300_000 });
  });

  it('charges the mover and passes the turn', () => {
    const r = applyMove(fresh(), 'white', { from: 'e2', to: 'e4' }, T0 + 4000);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.whiteMs).toBe(296_000);
    expect(r.state.turnStartedAt).toBe(T0 + 4000);
    expect(currentClocks(r.state, T0 + 6000)).toEqual({
      whiteMs: 296_000,
      blackMs: 298_000,
    });
  });

  it('adds the increment after a move', () => {
    const r = applyMove(
      initialState(5, 3, T0),
      'white',
      { from: 'e2', to: 'e4' },
      T0 + 4000,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.state.whiteMs).toBe(299_000);
  });

  it('flags the side to move when time is up and refuses its move', () => {
    const s = fresh();
    expect(flagged(s, T0 + 299_999)).toBeNull();
    expect(flagged(s, T0 + 300_000)).toBe('white');
    expect(
      applyMove(s, 'white', { from: 'e2', to: 'e4' }, T0 + 300_001),
    ).toEqual({ ok: false, error: 'Your time has run out' });
  });
});
