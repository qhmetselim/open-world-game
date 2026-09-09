import { describe, expect, it } from 'vitest';
import { IntersectionReservationBook } from './IntersectionReservation';

describe('intersection reservation book', () => {
  it('serializes access fairly, releases, and recovers from stale reservations', () => {
    const book = new IntersectionReservationBook();
    expect(book.request('i', 'a', 0, 2)).toBe(true);
    expect(book.request('i', 'b', 0, 2)).toBe(false);
    expect(book.request('i', 'c', 0, 2)).toBe(false);
    book.release('i', 'a');
    expect(book.request('i', 'b', .1, 2)).toBe(true);
    book.expire(3);
    expect(book.request('i', 'c', 3, 2)).toBe(true);
    expect(book.count).toBe(1);
  });
});
