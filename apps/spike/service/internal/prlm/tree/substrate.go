package tree

import (
	"context"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
)

// Substrate defines corpus-specific behavior used by an orchestrating tree.
// OracleTree handles orchestration (Init/Status/Sync/Ask) while a substrate
// handles how nodes survey, assemble domain, and check staleness.
type Substrate interface {
	Survey(ctx context.Context, rootPath string) ([]prlmnode.CorpusEntry, error)
	AssembleDomain(
		ctx context.Context,
		tree *Tree,
		node *prlmnode.Node,
		view prlmnode.Domain,
	) (*prlmnode.Domain, error)
	CheckStaleness(tree *Tree, node *prlmnode.Node) prlmnode.StalenessKind
	CountTokens(text string) int
}
