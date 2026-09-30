// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.0a (DW-279) -- the one naming rule for the visible placeholder
// twins `tools/make-placeholder-blend.py` generates (the spine's Consistency
// Conventions row "Visible placeholders"): the twin of `col_<x>` is
// `vis_<x>`, except the four `surface: 'dragon'` bodies, which merge into
// one `vis_dragon`, and the authored plunger rod `vis_plunger` (and, from
// Story 5.4, the spinner's bracket and blade). Shared by
// `src/presentation/mechanisms/`, the tests and the art passes (5.1-5.4) that
// replace a twin behind the same name.
//
// `vis_` is not a device prefix (`tools/boundary-lint.mjs` restricts
// `s_|c_|l_|f_|gi_|bd_|shot_|show_` literals only), so the constants below
// are lint-legal -- the same precedent as `backglass.ts`'s
// `BACKBOX_NODE_NAME`.

const COL_PREFIX = 'col_';
const VIS_PREFIX = 'vis_';

/** The merged visual of the four `surface: 'dragon'` collision bodies -- the mesh Story 5.1 replaces. */
export const VIS_DRAGON_NODE_NAME = 'vis_dragon';

/** The authored plunger rod, translated each frame by `Snapshot.mechanisms.plunger.posMm`. */
export const VIS_PLUNGER_NODE_NAME = 'vis_plunger';

/**
 * Story 5.4 -- the Left Loop spinner's static bracket. Its origin sits on the
 * spin axis (at the spinner's own table y), so its child blade spins about
 * its own origin.
 */
export const VIS_SPINNER_NODE_NAME = 'vis_spinner_l';

/** Story 5.4 -- the spinner's blade, a child of `VIS_SPINNER_NODE_NAME` (the "Art parts" `<parent>_<part>` rule), rotated each frame about table +X from `Snapshot.mechanisms.spinner`. */
export const VIS_SPINNER_BLADE_NODE_NAME = `${VIS_SPINNER_NODE_NAME}_blade`;

/**
 * `col_x` -> `vis_x`. Throws on a name without the `col_` prefix, so a
 * caller that passes a device or `vis_` name fails loudly instead of
 * resolving a node that does not exist.
 */
export function visTwinName(colName: string): string {
	if (!colName.startsWith(COL_PREFIX) || colName.length === COL_PREFIX.length) {
		throw new Error(`vis-names.ts: visTwinName(): "${colName}" is not a col_ node name`);
	}
	return VIS_PREFIX + colName.slice(COL_PREFIX.length);
}
