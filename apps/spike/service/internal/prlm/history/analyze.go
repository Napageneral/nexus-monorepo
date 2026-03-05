package history

import (
	"bufio"
	"fmt"
	"os/exec"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"
)

type computedStats struct {
	coChange *CoChangeStats
	velocity *VelocityStats
	events   *StructuralEventsStats
}

func computeStats(gitRoot string, head string, maxDepth int, bigBangThreshold int) (*computedStats, error) {
	if strings.TrimSpace(gitRoot) == "" {
		return nil, fmt.Errorf("gitRoot is required")
	}
	if maxDepth <= 0 {
		maxDepth = 3
	}
	if bigBangThreshold <= 0 {
		bigBangThreshold = 200
	}

	now := time.Now().UTC()
	cut7 := now.Add(-7 * 24 * time.Hour)
	cut30 := now.Add(-30 * 24 * time.Hour)
	cut90 := now.Add(-90 * 24 * time.Hour)

	dirCommitCounts := map[string]int{}
	pairCounts := map[string]map[string]int{}
	velAll := map[string]int{}
	vel7 := map[string]int{}
	vel30 := map[string]int{}
	vel90 := map[string]int{}

	structEvents := []StructuralEvent{}

	type commitAgg struct {
		hash        string
		date        time.Time
		subject     string
		dirs        map[string]struct{}
		fileChanges int
		addedDirs   map[string]struct{}
		removedDirs map[string]struct{}
		renamedDirs []DirRename
	}

	flush := func(c *commitAgg) {
		if c == nil || c.hash == "" || c.dirs == nil || len(c.dirs) == 0 {
			return
		}
		dirs := make([]string, 0, len(c.dirs))
		for d := range c.dirs {
			dirs = append(dirs, d)
		}
		sort.Strings(dirs)

		// Per-dir commit count.
		for _, d := range dirs {
			dirCommitCounts[d]++
			velAll[d]++
			if !c.date.IsZero() {
				if c.date.After(cut7) || c.date.Equal(cut7) {
					vel7[d]++
				}
				if c.date.After(cut30) || c.date.Equal(cut30) {
					vel30[d]++
				}
				if c.date.After(cut90) || c.date.Equal(cut90) {
					vel90[d]++
				}
			}
		}

		// Co-occurrence pairs.
		for i := 0; i < len(dirs); i++ {
			for j := i + 1; j < len(dirs); j++ {
				a := dirs[i]
				b := dirs[j]
				if a == b {
					continue
				}
				if a > b {
					a, b = b, a
				}
				m := pairCounts[a]
				if m == nil {
					m = map[string]int{}
					pairCounts[a] = m
				}
				m[b]++
			}
		}

		// Structural events: only persist commits that had structural signals.
		added := keysSorted(c.addedDirs)
		removed := keysSorted(c.removedDirs)
		renames := dedupeRenames(c.renamedDirs)
		big := c.fileChanges >= bigBangThreshold
		if big || len(added) > 0 || len(removed) > 0 || len(renames) > 0 {
			structEvents = append(structEvents, StructuralEvent{
				Hash:        c.hash,
				Date:        c.date,
				Subject:     c.subject,
				FileChanges: c.fileChanges,
				AddedDirs:   added,
				RemovedDirs: removed,
				RenamedDirs: renames,
				BigBang:     big,
			})
		}
	}

	cmd := exec.Command("git", "log", "--format=%H|%aI|%s", "--name-status", "--no-merges", "--", ".")
	cmd.Dir = gitRoot
	out, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	sc := bufio.NewScanner(out)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var cur *commitAgg
	for sc.Scan() {
		line := strings.TrimRight(sc.Text(), "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		if isCommitHeader(line) {
			if cur != nil {
				flush(cur)
			}
			hash, date, subj := parseCommitHeader(line)
			cur = &commitAgg{
				hash:        hash,
				date:        date,
				subject:     subj,
				dirs:        map[string]struct{}{},
				addedDirs:   map[string]struct{}{},
				removedDirs: map[string]struct{}{},
			}
			continue
		}

		if cur == nil {
			continue
		}

		status, oldPath, newPath := parseNameStatus(line)
		if status == "" {
			continue
		}
		cur.fileChanges++

		filePath := newPath
		if filePath == "" {
			filePath = oldPath
		}
		filePath = normalizeGitPath(filePath)
		if filePath == "" {
			continue
		}

		for _, k := range dirKeysForFile(filePath, maxDepth) {
			cur.dirs[k] = struct{}{}
		}

		switch {
		case strings.HasPrefix(status, "A"):
			if d := path.Dir(filePath); d != "." && d != "" {
				cur.addedDirs[d] = struct{}{}
			} else {
				cur.addedDirs["."] = struct{}{}
			}
		case strings.HasPrefix(status, "D"):
			if d := path.Dir(filePath); d != "." && d != "" {
				cur.removedDirs[d] = struct{}{}
			} else {
				cur.removedDirs["."] = struct{}{}
			}
		case strings.HasPrefix(status, "R"):
			from := normalizeGitPath(oldPath)
			to := normalizeGitPath(newPath)
			if from == "" || to == "" {
				break
			}
			score := parseRenameScore(status)
			cur.renamedDirs = append(cur.renamedDirs, DirRename{
				From:  path.Dir(from),
				To:    path.Dir(to),
				Score: score,
			})
		}
	}
	if err := sc.Err(); err != nil {
		_ = cmd.Wait()
		return nil, err
	}
	_ = out.Close()
	if err := cmd.Wait(); err != nil {
		return nil, err
	}
	if cur != nil {
		flush(cur)
	}

	// Flatten pairCounts to a stable list.
	pairs := make([]DirPairCount, 0, len(pairCounts))
	for a, m := range pairCounts {
		for b, co := range m {
			if co <= 0 {
				continue
			}
			pairs = append(pairs, DirPairCount{A: a, B: b, Co: co})
		}
	}
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].Co != pairs[j].Co {
			return pairs[i].Co > pairs[j].Co
		}
		if pairs[i].A != pairs[j].A {
			return pairs[i].A < pairs[j].A
		}
		return pairs[i].B < pairs[j].B
	})

	co := &CoChangeStats{
		Version:         currentVersion,
		GeneratedAt:     now,
		Head:            strings.TrimSpace(head),
		MaxDepth:        maxDepth,
		DirCommitCounts: dirCommitCounts,
		Pairs:           pairs,
	}

	vel := &VelocityStats{
		Version:     currentVersion,
		GeneratedAt: now,
		Head:        strings.TrimSpace(head),
		MaxDepth:    maxDepth,
		ByDir:       map[string]VelocityDirStats{},
	}
	max30 := 0
	for d := range dirCommitCounts {
		if vel30[d] > max30 {
			max30 = vel30[d]
		}
	}
	for d := range dirCommitCounts {
		v := VelocityDirStats{
			Commits7d:  vel7[d],
			Commits30d: vel30[d],
			Commits90d: vel90[d],
			CommitsAll: velAll[d],
		}
		v.Class = classifyVelocity(v, max30)
		vel.ByDir[d] = v
	}

	// Most recent first for easier querying.
	sort.Slice(structEvents, func(i, j int) bool { return structEvents[i].Date.After(structEvents[j].Date) })

	events := &StructuralEventsStats{
		Version:     currentVersion,
		GeneratedAt: now,
		Head:        strings.TrimSpace(head),
		Events:      structEvents,
	}

	return &computedStats{
		coChange: co,
		velocity: vel,
		events:   events,
	}, nil
}

func isCommitHeader(line string) bool {
	parts := strings.SplitN(line, "|", 3)
	if len(parts) < 2 {
		return false
	}
	hash := strings.TrimSpace(parts[0])
	if len(hash) < 7 {
		return false
	}
	for _, r := range hash {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			return false
		}
	}
	return true
}

func parseCommitHeader(line string) (string, time.Time, string) {
	parts := strings.SplitN(line, "|", 3)
	hash := ""
	date := time.Time{}
	subj := ""
	if len(parts) > 0 {
		hash = strings.TrimSpace(parts[0])
	}
	if len(parts) > 1 {
		ds := strings.TrimSpace(parts[1])
		if ts, err := time.Parse(time.RFC3339, ds); err == nil {
			date = ts
		}
	}
	if len(parts) > 2 {
		subj = strings.TrimSpace(parts[2])
	}
	return hash, date, subj
}

func parseNameStatus(line string) (status string, oldPath string, newPath string) {
	parts := strings.Split(line, "\t")
	if len(parts) < 2 {
		return "", "", ""
	}
	status = strings.TrimSpace(parts[0])
	if strings.HasPrefix(status, "R") && len(parts) >= 3 {
		oldPath = strings.TrimSpace(parts[1])
		newPath = strings.TrimSpace(parts[2])
		return status, oldPath, newPath
	}
	oldPath = strings.TrimSpace(parts[1])
	return status, oldPath, ""
}

func parseRenameScore(status string) int {
	status = strings.TrimSpace(status)
	if !strings.HasPrefix(status, "R") {
		return 0
	}
	n, _ := strconv.Atoi(strings.TrimPrefix(status, "R"))
	return n
}

func normalizeGitPath(p string) string {
	p = strings.TrimSpace(p)
	p = strings.TrimPrefix(p, "./")
	p = path.Clean(p)
	if p == "." || p == "" {
		return ""
	}
	return p
}

func dirKeysForFile(filePath string, maxDepth int) []string {
	filePath = normalizeGitPath(filePath)
	if filePath == "" {
		return nil
	}
	parts := strings.Split(filePath, "/")
	if len(parts) <= 1 {
		return []string{"."}
	}
	dirParts := parts[:len(parts)-1]
	if len(dirParts) == 0 {
		return []string{"."}
	}
	if maxDepth <= 0 {
		maxDepth = len(dirParts)
	}
	if maxDepth > len(dirParts) {
		maxDepth = len(dirParts)
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, maxDepth)
	for i := 1; i <= maxDepth; i++ {
		k := path.Join(dirParts[:i]...)
		if k == "" {
			continue
		}
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		out = append(out, k)
	}
	return out
}

func keysSorted(set map[string]struct{}) []string {
	if len(set) == 0 {
		return nil
	}
	out := make([]string, 0, len(set))
	for k := range set {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func dedupeRenames(in []DirRename) []DirRename {
	if len(in) == 0 {
		return nil
	}
	seen := map[string]DirRename{}
	for _, r := range in {
		from := strings.TrimSpace(r.From)
		to := strings.TrimSpace(r.To)
		if from == "" || to == "" || from == to {
			continue
		}
		key := from + "->" + to
		prev, ok := seen[key]
		if !ok || r.Score > prev.Score {
			seen[key] = r
		}
	}
	out := make([]DirRename, 0, len(seen))
	for _, r := range seen {
		out = append(out, r)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].From != out[j].From {
			return out[i].From < out[j].From
		}
		return out[i].To < out[j].To
	})
	return out
}

func classifyVelocity(v VelocityDirStats, max30 int) string {
	// A simple, repo-relative classifier: hot ~= top 40% of the max, warm ~= top 80% of the warm band.
	hotMin := 10
	warmMin := 3
	if max30 > 0 {
		if rel := int(float64(max30) * 0.6); rel > hotMin {
			hotMin = rel
		}
		if rel := int(float64(max30) * 0.2); rel > warmMin {
			warmMin = rel
		}
	}
	switch {
	case v.Commits7d >= 5 || v.Commits30d >= hotMin:
		return "hot"
	case v.Commits30d >= warmMin || v.Commits90d >= warmMin*3:
		return "warm"
	default:
		return "cold"
	}
}

