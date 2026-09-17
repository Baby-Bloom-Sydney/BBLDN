// The child-invite token's alphabet and shape, in one place because two files need the same 32 symbols and a
// second copy is how a mint and a check drift apart (02 §4.6 `child_invites`; memory `project_invite_token_format`).
//
// `XXXX-XXXX`, eight characters, **the hyphen stored and in the URL**. The alphabet is the one `0012`'s
// `child_invites_token_shape_check` enforces — `[0-9A-HJKMNP-TV-Z]`: the ten digits plus the 22 letters left
// once Crockford's four confusables are removed (I and L read as 1, O as 0, U as V). 32 symbols over 8 places
// is 32^8 ≈ 1.1 × 10^12, which is the number 07 §8 row 7 leans on when it pairs the lookup limit with a
// lockout instead of an expiry column. Thirty-two is also a divisor of 256, which is why the mint needs no
// rejection sampling: `byte % 32` maps exactly eight byte values onto each symbol.
//
// **There is no rotation.** A pending invite keeps its token until it is claimed or revoked (02 §4.6; the enum
// `invite_revoked_reason` has no `regenerated` member), so nothing re-mints for a row that already exists.
export const INVITE_TOKEN = Object.freeze({
  alphabet: "0123456789ABCDEFGHJKMNPQRSTVWXYZ",
  group: 4,
  length: 8,
  shape: /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
});
