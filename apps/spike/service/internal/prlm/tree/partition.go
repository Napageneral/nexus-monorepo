package tree

// partition.go contains token budget constants and partition/chunking helpers
// used by CodeSubstrate. These were previously in internal/policy/ but had
// exactly one consumer, so they live here now.

import (
	"fmt"
	"math"
	"path/filepath"
	"sort"
	"strings"

	prlmnode "github.com/Napageneral/spike/internal/prlm/node"
)

// Token budgets — the single source of truth for partition sizing.
const (
	MaxLeafTokens  = 100_000 // Split threshold: nodes above this get partitioned
	MinLeafTokens  = 20_000  // Floor: don't create children smaller than this
	SplitMax       = 120_000 // Hard ceiling per chunk
	SplitMinTokens = 30_000  // Minimum viable chunk size during splitting
)

// fileToken pairs a relative file path with its token count.
type fileToken struct {
	RelPath string
	Tokens  int
}

// childEntry is a directory child with its token count.
type childEntry struct {
	Path   string
	Tokens int
}

// childGroup is a bin-packed set of small directories.
type childGroup struct {
	Tokens   int
	Children []string
	BelowMin bool
}

// splitFileTokens divides a sorted list of files into chunks that target
// MaxLeafTokens tokens per chunk without exceeding SplitMax.
func splitFileTokens(files []fileToken, total int) [][]fileToken {
	if len(files) == 0 {
		return nil
	}
	sort.Slice(files, func(i, j int) bool {
		return files[i].RelPath < files[j].RelPath
	})

	maxChunk := SplitMax
	if maxChunk <= 0 {
		maxChunk = 65000
	}
	targetChunk := MaxLeafTokens
	if targetChunk <= 0 {
		targetChunk = 50000
	}
	if targetChunk > maxChunk {
		targetChunk = maxChunk
	}

	numChunks := int(math.Ceil(float64(total) / float64(targetChunk)))
	minChunksByMax := int(math.Ceil(float64(total) / float64(maxChunk)))
	if numChunks < minChunksByMax {
		numChunks = minChunksByMax
	}
	if numChunks < 1 {
		numChunks = 1
	}
	target := int(math.Ceil(float64(total) / float64(numChunks)))
	if target < SplitMinTokens {
		target = SplitMinTokens
	}
	if target > SplitMax {
		target = SplitMax
	}

	chunks := make([][]fileToken, 0, numChunks)
	var current []fileToken
	currentTokens := 0

	remainingFiles := len(files)
	for _, ft := range files {
		remainingFiles--
		if len(chunks) < numChunks-1 && currentTokens+ft.Tokens > target && len(current) > 0 {
			chunks = append(chunks, current)
			current = nil
			currentTokens = 0
		}
		current = append(current, ft)
		currentTokens += ft.Tokens

		if len(chunks)+1 < numChunks && remainingFiles == 0 {
			chunks = append(chunks, current)
			current = nil
			currentTokens = 0
		}
	}
	if len(current) > 0 {
		chunks = append(chunks, current)
	}
	if len(chunks) > 1 {
		last := chunks[len(chunks)-1]
		lastTokens := 0
		for _, ft := range last {
			lastTokens += ft.Tokens
		}
		if lastTokens > 0 && lastTokens < MinLeafTokens {
			chunks[len(chunks)-2] = append(chunks[len(chunks)-2], last...)
			chunks = chunks[:len(chunks)-1]
		}
	}
	return chunks
}

// smallChild is an internal representation used during grouping.
type smallChild struct {
	Path   string
	Tokens int
	Rel    string
}

// groupSmallChildren packs small sibling directories into groups that meet
// minTokens without exceeding maxTokens.
func groupSmallChildren(parent string, children []childEntry, minTokens int, maxTokens int) []childGroup {
	if len(children) == 0 {
		return nil
	}
	if minTokens <= 0 {
		minTokens = 20000
	}
	if maxTokens <= 0 {
		maxTokens = 100000
	}

	total := 0
	small := make([]smallChild, 0, len(children))
	for _, child := range children {
		rel := strings.TrimPrefix(child.Path, parent+"/")
		if parent == "." {
			rel = child.Path
		}
		if rel == "" || rel == "." {
			continue
		}
		rel = filepath.ToSlash(rel)
		small = append(small, smallChild{Path: child.Path, Tokens: child.Tokens, Rel: rel})
		total += child.Tokens
	}
	if total == 0 {
		return nil
	}

	sort.Slice(small, func(i, j int) bool {
		if small[i].Tokens == small[j].Tokens {
			return small[i].Rel < small[j].Rel
		}
		return small[i].Tokens > small[j].Tokens
	})

	tokenByPath := make(map[string]int, len(small))
	for _, item := range small {
		tokenByPath[item.Path] = item.Tokens
	}

	buildGroup := func(items []smallChild, tokens int, belowMin bool) childGroup {
		ch := make([]string, 0, len(items))
		for _, item := range items {
			ch = append(ch, item.Path)
		}
		sort.Strings(ch)
		return childGroup{
			Tokens:   tokens,
			Children: ch,
			BelowMin: belowMin,
		}
	}

	var groups []childGroup
	var current []smallChild
	currentTokens := 0
	for _, child := range small {
		if currentTokens > 0 && currentTokens+child.Tokens > maxTokens {
			groups = append(groups, buildGroup(current, currentTokens, currentTokens < minTokens))
			current = nil
			currentTokens = 0
		}
		current = append(current, child)
		currentTokens += child.Tokens
	}
	if len(current) > 0 {
		if currentTokens < minTokens && len(groups) > 0 {
			last := groups[len(groups)-1]
			if last.Tokens+currentTokens <= maxTokens {
				for _, item := range current {
					last.Children = append(last.Children, item.Path)
				}
				last.Tokens += currentTokens
				sort.Strings(last.Children)
				last.BelowMin = last.Tokens < minTokens
				groups[len(groups)-1] = last
			} else {
				groups = append(groups, buildGroup(current, currentTokens, true))
			}
		} else if currentTokens >= minTokens {
			groups = append(groups, buildGroup(current, currentTokens, false))
		} else {
			groups = append(groups, buildGroup(current, currentTokens, true))
		}
	}

	// Rebalance if the last group is below min and we can move items.
	if len(groups) > 1 {
		lastIdx := len(groups) - 1
		last := groups[lastIdx]
		if last.Tokens < minTokens {
			prev := groups[lastIdx-1]
			candidates := append([]string{}, prev.Children...)
			sort.Slice(candidates, func(i, j int) bool {
				return tokenByPath[candidates[i]] < tokenByPath[candidates[j]]
			})
			for last.Tokens < minTokens {
				moved := false
				for _, childPath := range candidates {
					t := tokenByPath[childPath]
					if last.Tokens+t > maxTokens {
						continue
					}
					if prev.Tokens-t < minTokens {
						continue
					}
					prev.Children = removeStr(prev.Children, childPath)
					last.Children = append(last.Children, childPath)
					prev.Tokens -= t
					last.Tokens += t
					moved = true
					break
				}
				if !moved {
					break
				}
			}
			if len(prev.Children) > 0 {
				sort.Strings(prev.Children)
				prev.BelowMin = prev.Tokens < minTokens
				groups[lastIdx-1] = prev
			}
			if len(last.Children) > 0 {
				sort.Strings(last.Children)
				last.BelowMin = last.Tokens < minTokens
				groups[lastIdx] = last
			}
		}
	}

	return groups
}

func removeStr(ss []string, target string) []string {
	if len(ss) == 0 {
		return ss
	}
	out := ss[:0]
	for _, s := range ss {
		if s != target {
			out = append(out, s)
		}
	}
	return out
}

func groupTokenCount(tree *Tree, paths []string) int {
	if tree == nil || len(paths) == 0 {
		return 0
	}
	sum := 0
	for _, p := range paths {
		if e, ok := tree.Index[p]; ok && e.Tokens > 0 {
			sum += e.Tokens
			continue
		}
		sum++
	}
	return sum
}

func shouldBundleCoupling(score float64, co int) bool {
	// Conservative heuristic: only bundle very high coupling with at least some evidence.
	if co < 2 {
		return false
	}
	return score >= 0.95
}

func bundleKey(members []string) string {
	h := prlmnode.StableHash(map[string]any{
		"members": members,
	})
	if len(h) > 8 {
		h = h[:8]
	}
	if h == "" {
		h = fmt.Sprintf("%d", len(members))
	}
	return "@bundle-" + h
}
