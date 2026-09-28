// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Negative control: an identifier CONTAINING "red" as a substring, never as
// its own word -- must NOT fire sim-no-colour (AD-9). Mirrors the real
// repository's own GPL "redistribute" lines (Design Notes, "Measured
// false-positive surface").
export function redistribute(count: number): number {
	return count;
}
