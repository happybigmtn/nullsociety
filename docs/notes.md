# Notes

Scratch notes collected during development.

- CasinoToggleShield and CasinoToggleDouble only apply in tournaments, so maybe they don't need to be their own instruction variants and can be a subset of CasinoGameMove.
  - CasinoSuper is a type of game mode; it also feels like it should be a CasinoGameMove subset.
- Zero-copy limitations: the code uses Vec<u8> and String heavily in Read implementations.
  - Critique: every time a block is parsed, it allocates new memory for every transaction payload and string.
  - Alternative: use Cow<'a, [u8]> (copy-on-write) so structs can point directly to the raw byte buffer without allocating, speeding up block processing under load.
