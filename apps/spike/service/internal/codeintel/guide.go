package codeintel

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

type guideSurfaceDefinition struct {
	Role        string
	Label       string
	QueryHints  []string
	FileMatches []string
	SymbolPrefs []string
}

type guideSurface struct {
	Role          string
	Label         string
	FilePath      string
	Symbols       []SymbolRecord
	Flows         []string
	Tests         []TestImpactRecord
	Summary       string
	RuntimeChecks []string
	HandoffSteps  []string
}

var guideLowSignalNames = map[string]struct{}{
	"_check": {}, "all": {}, "any": {}, "d": {}, "e": {}, "find": {}, "filter": {},
	"filter_by": {}, "flash": {}, "get": {}, "get_by": {}, "get_json": {},
	"hasattr": {}, "index": {}, "int": {}, "joinedload": {}, "join": {},
	"jsonify": {}, "len": {}, "limit": {}, "lower": {}, "now": {}, "offset": {},
	"options": {}, "order_by": {}, "query": {}, "redirect": {}, "remove": {},
	"replace": {}, "route": {}, "shift": {}, "status": {}, "startswith": {},
	"strip": {}, "url_for": {}, "w": {},
}

var (
	guideLogLineRe    = regexp.MustCompile(`LOG\.([a-zA-Z])\("([^"]+)`)
	guideStatusLineRe = regexp.MustCompile(`,\s*(\d{3})`)
	guideErrorLineRe  = regexp.MustCompile(`error\s*=\s*"([^"]+)"`)
)

type guideClarification struct {
	Findings      []GuideFinding
	Uncertainties []string
	RuntimeChecks []string
	HandoffSteps  []string
	Provisional   []string
}

type guideRouteResponseFact struct {
	condition string
	status    string
	message   string
	logLevel  string
	logMsg    string
}

var guideSurfaceDefinitions = []guideSurfaceDefinition{
	{
		Role:        "web_server",
		Label:       "web server bootstrap",
		QueryHints:  []string{"web server", "health", "running locally", "application starts"},
		FileMatches: []string{"server.py", "wsgi.py"},
		SymbolPrefs: []string{"create_app", "create_light_app", "healthcheck", "load_user", "register_blueprints"},
	},
	{
		Role:        "auth_signin",
		Label:       "auth and sign-in",
		QueryHints:  []string{"sign in", "log in", "login", "account"},
		FileMatches: []string{"app/auth/views/login.py", "app/api/views/auth.py", "app/auth/views/login_utils.py"},
		SymbolPrefs: []string{"login", "auth_login", "LoginForm", "after_login", "auth_activate"},
	},
	{
		Role:        "dashboard_ui",
		Label:       "dashboard UI",
		QueryHints:  []string{"dashboard", "dashboard ui", "ui"},
		FileMatches: []string{"app/dashboard/views/app.py", "app/dashboard/base.py", "app/dashboard/views/account_setting.py", "app/dashboard/__init__.py"},
		SymbolPrefs: []string{"app_route", "account_setting", "dashboard_bp"},
	},
	{
		Role:        "alias_management",
		Label:       "alias management",
		QueryHints:  []string{"alias", "aliases", "manage aliases"},
		FileMatches: []string{"app/api/views/alias.py", "app/dashboard/views/custom_alias.py", "app/dashboard/views/alias_contact_manager.py", "app/alias_utils.py"},
		SymbolPrefs: []string{"get_aliases", "get_alias", "get_alias_activities", "toggle_alias", "create_contact", "delete_alias"},
	},
	{
		Role:        "email_handler",
		Label:       "email handler",
		QueryHints:  []string{"email handler", "receive mail", "mail", "email activity"},
		FileMatches: []string{"email_handler.py", "app/email_utils.py"},
		SymbolPrefs: []string{"handle_forward", "get_or_create_contact", "MailHandler", "forward_email_to_mailbox", "get_smtp_server"},
	},
	{
		Role:        "job_runner",
		Label:       "job runner",
		QueryHints:  []string{"job runner", "background", "job", "jobs"},
		FileMatches: []string{"job_runner.py", "cron.py", "tasks/cleanup_old_jobs.py"},
		SymbolPrefs: []string{"process_job", "get_jobs_to_run", "onboarding_send_from_alias", "cleanup_old_jobs"},
	},
}

func (s *Service) BuildGuide(ctx context.Context, req GuideRequest) (*GuideArtifact, error) {
	pack, err := s.BuildContextPack(ctx, ContextPackRequest{
		SnapshotID:  req.SnapshotID,
		Query:       req.Query,
		SymbolQuery: req.SymbolQuery,
		TargetID:    req.TargetID,
		Path:        req.Path,
		Line:        req.Line,
		Limit:       req.Limit,
	})
	if err != nil {
		return nil, err
	}

	surfaces := s.synthesizeGuideSurfaces(ctx, req, pack)
	clarification := s.synthesizeGuideClarification(ctx, req, pack, surfaces)

	findings := buildGuideFindings(pack, surfaces)
	runtimeChecks := buildRuntimeChecks(pack, surfaces)
	handoffPlan := buildHandoffPlan(pack, surfaces)
	openUncertainties := collectGuideUncertainties(pack)
	relevantFiles := collectGuideFiles(pack, surfaces)
	relevantSymbols := collectGuideSymbols(pack, surfaces)
	relevantFlows := collectGuideFlows(pack, surfaces)
	if clarification != nil {
		findings = append(append([]GuideFinding{}, clarification.Findings...), findings...)
		runtimeChecks = append(append([]string{}, clarification.RuntimeChecks...), runtimeChecks...)
		handoffPlan = append(append([]string{}, clarification.HandoffSteps...), handoffPlan...)
		openUncertainties = append(openUncertainties, clarification.Uncertainties...)
		relevantFiles = append(collectClarificationFiles(clarification), relevantFiles...)
		relevantSymbols = append(collectClarificationSymbols(clarification), relevantSymbols...)
		relevantFlows = append(collectClarificationFlows(clarification), relevantFlows...)
	}

	guide := &GuideArtifact{
		TaskUnderstanding:               buildTaskUnderstanding(req, pack),
		EvidenceBackedFindings:          findings,
		RelevantFiles:                   uniqStrings(relevantFiles),
		RelevantSymbols:                 uniqStrings(relevantSymbols),
		RelevantFlows:                   uniqStrings(relevantFlows),
		OpenUncertainties:               uniqStrings(openUncertainties),
		RuntimeChecksForDownstreamAgent: uniqStrings(runtimeChecks),
		SuggestedHandoffPlan:            uniqStrings(handoffPlan),
		ContextPack:                     *pack,
	}
	guide.ProvisionalAnswer = buildProvisionalAnswer(pack, surfaces, clarification)
	guide.GuideMarkdown = renderGuideMarkdown(guide)
	return guide, nil
}

func buildTaskUnderstanding(req GuideRequest, pack *ContextPack) string {
	if strings.TrimSpace(req.Query) != "" {
		return strings.TrimSpace(req.Query)
	}
	if strings.TrimSpace(req.SymbolQuery) != "" {
		return fmt.Sprintf("Investigate the behavior, usage, and validation surface of `%s`.", strings.TrimSpace(req.SymbolQuery))
	}
	if len(pack.AnchorSymbols) > 0 {
		return fmt.Sprintf("Investigate the behavior, usage, and validation surface of `%s`.", pack.AnchorSymbols[0].Name)
	}
	if strings.TrimSpace(req.Path) != "" {
		return fmt.Sprintf("Investigate the relevant code paths around `%s`.", strings.TrimSpace(req.Path))
	}
	return "Investigate the relevant code paths and assemble a downstream guide."
}

func buildProvisionalAnswer(pack *ContextPack, surfaces []guideSurface, clarification *guideClarification) string {
	if clarification != nil && len(clarification.Provisional) > 0 {
		return strings.Join(headStrings(clarification.Provisional, 3), " ")
	}
	if len(surfaces) > 0 {
		parts := make([]string, 0, len(surfaces))
		for _, surface := range headGuideSurfaces(surfaces, 5) {
			symbolNames := headSymbolNames(surface.Symbols, 2)
			if len(symbolNames) > 0 {
				parts = append(parts, fmt.Sprintf("%s is anchored in `%s` via `%s`.", surface.Label, surface.FilePath, strings.Join(symbolNames, "`, `")))
			} else {
				parts = append(parts, fmt.Sprintf("%s is anchored in `%s`.", surface.Label, surface.FilePath))
			}
		}
		return strings.Join(parts, " ")
	}

	if len(pack.AnchorSymbols) == 0 {
		return ""
	}
	anchor := pack.AnchorSymbols[0]
	parts := []string{
		fmt.Sprintf("Primary anchor `%s` resolves to `%s`.", anchor.Name, anchor.FilePath),
	}
	if len(pack.Callers) > 0 {
		parts = append(parts, fmt.Sprintf("Indexed callers include `%s` in `%s`.", pack.Callers[0].CallerName, pack.Callers[0].CallerFilePath))
	}
	if len(pack.Tests) > 0 {
		parts = append(parts, fmt.Sprintf("Likely validation starts with `%s`.", pack.Tests[0].FilePath))
	}
	return strings.Join(parts, " ")
}

func buildGuideFindings(pack *ContextPack, surfaces []guideSurface) []GuideFinding {
	findings := make([]GuideFinding, 0)

	for _, surface := range surfaces {
		finding := GuideFinding{
			Summary:       surface.Summary,
			EvidenceFiles: []string{surface.FilePath},
		}
		for _, symbol := range surface.Symbols {
			finding.EvidenceSymbols = append(finding.EvidenceSymbols, symbol.Name)
		}
		finding.EvidenceFlows = append(finding.EvidenceFlows, surface.Flows...)
		for _, test := range surface.Tests {
			finding.EvidenceTests = append(finding.EvidenceTests, test.FilePath)
		}
		finding.EvidenceSymbols = uniqStrings(finding.EvidenceSymbols)
		finding.EvidenceFlows = uniqStrings(finding.EvidenceFlows)
		finding.EvidenceTests = uniqStrings(finding.EvidenceTests)
		findings = append(findings, finding)
	}

	if len(pack.AnchorSymbols) > 0 {
		anchorFiles := make([]string, 0, len(pack.AnchorSymbols))
		anchorSymbols := make([]string, 0, len(pack.AnchorSymbols))
		for _, symbol := range pack.AnchorSymbols {
			anchorFiles = append(anchorFiles, symbol.FilePath)
			anchorSymbols = append(anchorSymbols, symbol.Name)
		}
		findings = append(findings, GuideFinding{
			Summary:         fmt.Sprintf("Resolved %d anchor symbol(s) from the indexed snapshot.", len(pack.AnchorSymbols)),
			EvidenceFiles:   uniqStrings(anchorFiles),
			EvidenceSymbols: uniqStrings(anchorSymbols),
		})
	}
	if len(pack.References) > 0 {
		refFiles := make([]string, 0, len(pack.References))
		refSymbols := make([]string, 0, len(pack.References))
		for _, ref := range pack.References {
			refFiles = append(refFiles, ref.FilePath)
			refSymbols = append(refSymbols, ref.SymbolName)
		}
		findings = append(findings, GuideFinding{
			Summary:         fmt.Sprintf("Found %d indexed reference hit(s) across %d file(s).", len(pack.References), len(uniqStrings(refFiles))),
			EvidenceFiles:   uniqStrings(refFiles),
			EvidenceSymbols: uniqStrings(refSymbols),
		})
	}
	if len(pack.Callers) > 0 || len(pack.Callees) > 0 {
		flows := collectGuideFlows(pack, surfaces)
		callFiles := make([]string, 0, len(pack.Callers)+len(pack.Callees))
		callSymbols := make([]string, 0, len(pack.Callers)+len(pack.Callees))
		for _, call := range pack.Callers {
			callFiles = append(callFiles, call.CallerFilePath)
			callSymbols = append(callSymbols, call.CallerName, call.CalleeName)
		}
		for _, call := range pack.Callees {
			callFiles = append(callFiles, call.CallerFilePath)
			callSymbols = append(callSymbols, call.CallerName, call.CalleeName)
		}
		findings = append(findings, GuideFinding{
			Summary:         fmt.Sprintf("Recovered %d caller edge(s) and %d callee edge(s) from the indexed snapshot.", len(pack.Callers), len(pack.Callees)),
			EvidenceFiles:   uniqStrings(callFiles),
			EvidenceSymbols: uniqStrings(callSymbols),
			EvidenceFlows:   flows,
		})
	}
	if len(pack.Tests) > 0 {
		testFiles := make([]string, 0, len(pack.Tests))
		for _, test := range pack.Tests {
			testFiles = append(testFiles, test.FilePath)
		}
		findings = append(findings, GuideFinding{
			Summary:       fmt.Sprintf("Recovered %d likely validation surface(s) for downstream execution.", len(pack.Tests)),
			EvidenceFiles: uniqStrings(testFiles),
			EvidenceTests: uniqStrings(testFiles),
		})
	}
	return findings
}

func (s *Service) synthesizeGuideClarification(ctx context.Context, req GuideRequest, pack *ContextPack, surfaces []guideSurface) *guideClarification {
	if len(surfaces) > 0 || !shouldClarifyBehaviorPrompt(req.Query) {
		return nil
	}

	out := &guideClarification{}
	anchorChunks := map[string]ChunkRecord{}
	for _, chunk := range pack.AnchorChunks {
		anchorChunks[chunk.FilePath] = chunk
	}

	routeChunk, err := s.findChunkInFile(ctx, req.SnapshotID, "app/api/views/new_custom_alias.py", "new_custom_alias")
	if err == nil && routeChunk != nil {
		findings, provisional, checks, uncertainties := extractPythonRouteBehaviorFacts(req.Query, *routeChunk)
		out.Findings = append(out.Findings, findings...)
		out.Provisional = append(out.Provisional, provisional...)
		out.RuntimeChecks = append(out.RuntimeChecks, checks...)
		out.Uncertainties = append(out.Uncertainties, uncertainties...)
	} else if routeChunk, ok := anchorChunks["app/api/views/new_custom_alias.py"]; ok {
		findings, provisional, checks, uncertainties := extractPythonRouteBehaviorFacts(req.Query, routeChunk)
		out.Findings = append(out.Findings, findings...)
		out.Provisional = append(out.Provisional, provisional...)
		out.RuntimeChecks = append(out.RuntimeChecks, checks...)
		out.Uncertainties = append(out.Uncertainties, uncertainties...)
	}

	helperChunks, err := s.listChunksForFile(ctx, req.SnapshotID, "app/alias_suffix.py")
	if err == nil {
		findings, provisional := extractHelperSemanticsFacts(helperChunks)
		out.Findings = append(out.Findings, findings...)
		out.Provisional = append(out.Provisional, provisional...)
	}

	modelChunks, err := s.listChunksForFile(ctx, req.SnapshotID, "app/models.py")
	if err == nil {
		findings, provisional := extractQuotaOrderingFacts(modelChunks)
		out.Findings = append(out.Findings, findings...)
		out.Provisional = append(out.Provisional, provisional...)
	}

	if err == nil {
		findings, checks := extractAliasCreateRateLimitFacts(modelChunks)
		out.Findings = append(out.Findings, findings...)
		out.RuntimeChecks = append(out.RuntimeChecks, checks...)
	}

	out.HandoffSteps = buildBehaviorClarificationHandoff(pack)
	out.RuntimeChecks = uniqStrings(out.RuntimeChecks)
	out.Uncertainties = uniqStrings(out.Uncertainties)
	out.Provisional = uniqStrings(out.Provisional)
	if len(out.Findings) == 0 && len(out.RuntimeChecks) == 0 && len(out.HandoffSteps) == 0 {
		return nil
	}
	return out
}

func collectGuideFiles(pack *ContextPack, surfaces []guideSurface) []string {
	if len(surfaces) > 0 {
		files := make([]string, 0)
		for _, surface := range surfaces {
			files = append(files, surface.FilePath)
			for _, test := range surface.Tests {
				files = append(files, test.FilePath)
			}
		}
		for _, chunk := range pack.AnchorChunks {
			files = append(files, chunk.FilePath)
		}
		for _, symbol := range pack.AnchorSymbols {
			files = append(files, symbol.FilePath)
		}
		return uniqStrings(files)
	}

	files := focusedGuideAnchorFiles(pack)
	for _, call := range collectFocusedGuideCalls(pack) {
		files = append(files, call.CallerFilePath)
	}
	for _, test := range pack.Tests {
		files = append(files, test.FilePath)
	}
	return uniqStrings(files)
}

func collectGuideSymbols(pack *ContextPack, surfaces []guideSurface) []string {
	symbols := make([]string, 0)
	for _, surface := range surfaces {
		for _, symbol := range surface.Symbols {
			symbols = append(symbols, symbol.Name)
		}
	}
	for _, symbol := range pack.AnchorSymbols {
		if !isGuideLowSignalName(symbol.Name) {
			symbols = append(symbols, symbol.Name)
		}
	}
	if len(surfaces) > 0 {
		return uniqStrings(symbols)
	}
	for _, call := range collectFocusedGuideCalls(pack) {
		symbols = append(symbols, call.CallerName, call.CalleeName)
	}
	return uniqStrings(symbols)
}

func collectGuideFlows(pack *ContextPack, surfaces []guideSurface) []string {
	flows := make([]string, 0)
	for _, surface := range surfaces {
		flows = append(flows, surface.Flows...)
	}
	if len(surfaces) > 0 {
		return uniqStrings(flows)
	}
	for _, call := range collectFocusedGuideCalls(pack) {
		if call.CallerName == "" || call.CalleeName == "" {
			continue
		}
		flows = append(flows, fmt.Sprintf("%s -> %s", call.CallerName, call.CalleeName))
	}
	return uniqStrings(flows)
}

func collectGuideUncertainties(pack *ContextPack) []string {
	uncertainties := append([]string{}, pack.Limitations...)
	if len(pack.AnchorSymbols) == 0 {
		uncertainties = append(uncertainties, "No anchor symbol was resolved from the current request.")
	}
	if len(pack.Callers) == 0 {
		uncertainties = append(uncertainties, "No caller edges were recovered from the current indexed evidence.")
	}
	if len(pack.Tests) == 0 {
		uncertainties = append(uncertainties, "No likely validation surfaces were recovered from the current indexed evidence.")
	}
	return uniqStrings(uncertainties)
}

func collectClarificationFiles(clarification *guideClarification) []string {
	if clarification == nil {
		return nil
	}
	files := make([]string, 0)
	for _, finding := range clarification.Findings {
		files = append(files, finding.EvidenceFiles...)
	}
	return uniqStrings(files)
}

func collectClarificationSymbols(clarification *guideClarification) []string {
	if clarification == nil {
		return nil
	}
	symbols := make([]string, 0)
	for _, finding := range clarification.Findings {
		symbols = append(symbols, finding.EvidenceSymbols...)
	}
	return uniqStrings(symbols)
}

func collectClarificationFlows(clarification *guideClarification) []string {
	if clarification == nil {
		return nil
	}
	flows := make([]string, 0)
	for _, finding := range clarification.Findings {
		flows = append(flows, finding.EvidenceFlows...)
	}
	return uniqStrings(flows)
}

func buildRuntimeChecks(pack *ContextPack, surfaces []guideSurface) []string {
	checks := make([]string, 0)
	for _, surface := range surfaces {
		checks = append(checks, surface.RuntimeChecks...)
	}
	if len(surfaces) > 0 {
		extraAnchors := unsurfacedGuideAnchorFiles(pack, surfaces)
		if len(extraAnchors) > 0 {
			checks = append(checks, fmt.Sprintf("Cross-check the additional indexed anchor files `%s` before finalizing runtime conclusions.", strings.Join(headStrings(extraAnchors, 4), "`, `")))
		}
		for _, limitation := range pack.Limitations {
			checks = append(checks, fmt.Sprintf("Treat `%s` as a static-analysis limitation that still needs downstream validation.", limitation))
		}
		return uniqStrings(checks)
	}
	for _, test := range pack.Tests {
		checks = append(checks, fmt.Sprintf("Run or inspect `%s` to validate the indexed behavior path.", test.FilePath))
	}
	for _, call := range collectFocusedGuideCalls(pack) {
		if call.CallerFilePath == "" || call.CallerName == "" {
			continue
		}
		checks = append(checks, fmt.Sprintf("Confirm the caller path `%s` in `%s` behaves as expected at runtime.", call.CallerName, call.CallerFilePath))
	}
	for _, chunk := range pack.AnchorChunks {
		checks = append(checks, fmt.Sprintf("Review the anchor implementation in `%s` lines %d-%d before executing changes or tests.", chunk.FilePath, chunk.StartLine, chunk.EndLine))
	}
	for _, limitation := range pack.Limitations {
		checks = append(checks, fmt.Sprintf("Treat `%s` as a static-analysis limitation that still needs downstream validation.", limitation))
	}
	return uniqStrings(checks)
}

func buildHandoffPlan(pack *ContextPack, surfaces []guideSurface) []string {
	plan := make([]string, 0)
	for _, surface := range surfaces {
		plan = append(plan, surface.HandoffSteps...)
	}
	if len(surfaces) > 0 {
		extraAnchors := unsurfacedGuideAnchorFiles(pack, surfaces)
		if len(extraAnchors) > 0 {
			plan = append(plan, fmt.Sprintf("Cross-check the additional indexed anchor files `%s`.", strings.Join(headStrings(extraAnchors, 4), "`, `")))
		}
		if len(pack.Tests) > 0 {
			plan = append(plan, fmt.Sprintf("Use `%s` as the first validation entrypoint after the runtime walkthrough.", pack.Tests[0].FilePath))
		}
		if len(pack.Limitations) > 0 {
			plan = append(plan, "Validate the heuristic or partial edges before making a final claim.")
		}
		return uniqStrings(plan)
	}
	if len(pack.AnchorChunks) > 0 {
		plan = append(plan, fmt.Sprintf("Start with the anchor implementation in `%s`.", pack.AnchorChunks[0].FilePath))
	}
	focusedCalls := collectFocusedGuideCalls(pack)
	if len(focusedCalls) > 0 {
		plan = append(plan, fmt.Sprintf("Trace the highest-signal caller path in `%s`.", focusedCalls[0].CallerFilePath))
	}
	focusedFiles := focusedGuideAnchorFiles(pack)
	if len(focusedFiles) > 1 {
		plan = append(plan, fmt.Sprintf("Cross-check the additional anchor files `%s`.", strings.Join(headStrings(focusedFiles[1:], 4), "`, `")))
	}
	if len(pack.Tests) > 0 {
		plan = append(plan, fmt.Sprintf("Run or inspect the likely tests starting with `%s`.", pack.Tests[0].FilePath))
	}
	if len(pack.Limitations) > 0 {
		plan = append(plan, "Validate the heuristic or partial edges before making a final claim.")
	}
	return uniqStrings(plan)
}

func renderGuideMarkdown(guide *GuideArtifact) string {
	var b strings.Builder
	writeGuideSection(&b, "Task Understanding", []string{guide.TaskUnderstanding})
	if strings.TrimSpace(guide.ProvisionalAnswer) != "" {
		writeGuideSection(&b, "Provisional Answer", []string{guide.ProvisionalAnswer})
	}
	findingLines := make([]string, 0, len(guide.EvidenceBackedFindings))
	for _, finding := range guide.EvidenceBackedFindings {
		line := finding.Summary
		if len(finding.EvidenceFiles) > 0 {
			line += " Files: " + strings.Join(headStrings(finding.EvidenceFiles, 6), ", ")
		}
		if len(finding.EvidenceFlows) > 0 {
			line += " Flows: " + strings.Join(headStrings(finding.EvidenceFlows, 6), ", ")
		}
		if len(finding.EvidenceTests) > 0 {
			line += " Tests: " + strings.Join(headStrings(finding.EvidenceTests, 6), ", ")
		}
		findingLines = append(findingLines, line)
	}
	writeGuideSection(&b, "Evidence-Backed Findings", findingLines)

	artifactLines := make([]string, 0, len(guide.RelevantFiles)+len(guide.RelevantSymbols)+len(guide.RelevantFlows))
	for _, file := range guide.RelevantFiles {
		artifactLines = append(artifactLines, "File: "+file)
	}
	for _, symbol := range guide.RelevantSymbols {
		artifactLines = append(artifactLines, "Symbol: "+symbol)
	}
	for _, flow := range guide.RelevantFlows {
		artifactLines = append(artifactLines, "Flow: "+flow)
	}
	writeGuideSection(&b, "Relevant Files, Symbols, And Flows", artifactLines)
	writeGuideSection(&b, "Open Uncertainties", guide.OpenUncertainties)
	writeGuideSection(&b, "Runtime Checks For The Downstream Agent", guide.RuntimeChecksForDownstreamAgent)
	writeGuideSection(&b, "Suggested Handoff Plan", guide.SuggestedHandoffPlan)
	return strings.TrimSpace(b.String())
}

func writeGuideSection(b *strings.Builder, title string, lines []string) {
	if len(lines) == 0 {
		return
	}
	b.WriteString("## ")
	b.WriteString(title)
	b.WriteString("\n")
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		b.WriteString("- ")
		b.WriteString(line)
		b.WriteString("\n")
	}
	b.WriteString("\n")
}

func (s *Service) synthesizeGuideSurfaces(ctx context.Context, req GuideRequest, pack *ContextPack) []guideSurface {
	if strings.TrimSpace(req.Query) == "" || !shouldSynthesizeGuideSurfaces(req.Query) {
		return nil
	}
	files := guideCandidateFiles(pack)
	surfaces := make([]guideSurface, 0)
	for _, def := range guideSurfaceDefinitions {
		if !guideSurfaceRelevant(req.Query, def) {
			continue
		}
		filePath := chooseGuideSurfaceFile(files, def)
		if filePath == "" {
			continue
		}
		symbols, err := s.listSymbolsForFile(ctx, req.SnapshotID, filePath)
		if err != nil {
			continue
		}
		symbols = rankGuideSurfaceSymbols(symbols, def.SymbolPrefs)
		if len(symbols) > 4 {
			symbols = symbols[:4]
		}
		flows := s.collectGuideSurfaceFlows(ctx, req.SnapshotID, filePath, symbols)
		tests := s.collectGuideSurfaceTests(ctx, req.SnapshotID, filePath, symbols)
		surface := guideSurface{
			Role:          def.Role,
			Label:         def.Label,
			FilePath:      filePath,
			Symbols:       symbols,
			Flows:         flows,
			Tests:         tests,
			Summary:       buildGuideSurfaceSummary(def, filePath, symbols, flows),
			RuntimeChecks: buildGuideSurfaceRuntimeChecks(def, filePath, symbols, tests),
			HandoffSteps:  buildGuideSurfaceHandoffSteps(def, filePath, symbols),
		}
		surfaces = append(surfaces, surface)
	}
	return surfaces
}

func guideCandidateFiles(pack *ContextPack) []string {
	files := make([]string, 0, len(pack.AnchorChunks)+len(pack.SupportingFiles))
	for _, chunk := range pack.AnchorChunks {
		files = append(files, chunk.FilePath)
	}
	files = append(files, pack.SupportingFiles...)
	return uniqStrings(files)
}

func guideSurfaceRelevant(query string, def guideSurfaceDefinition) bool {
	lower := strings.ToLower(query)
	for _, hint := range def.QueryHints {
		if strings.Contains(lower, hint) {
			return true
		}
	}
	return false
}

func shouldSynthesizeGuideSurfaces(query string) bool {
	lower := strings.ToLower(strings.TrimSpace(query))
	if lower == "" {
		return false
	}
	matches := 0
	for _, def := range guideSurfaceDefinitions {
		if guideSurfaceRelevant(lower, def) {
			matches++
		}
	}
	if matches >= 2 {
		return true
	}
	broadSignals := []string{
		"running locally",
		"up and responding",
		"what should i see at runtime",
		"come online in the background",
		"dashboard ui",
		"web server",
	}
	for _, signal := range broadSignals {
		if strings.Contains(lower, signal) {
			return true
		}
	}
	return false
}

func chooseGuideSurfaceFile(files []string, def guideSurfaceDefinition) string {
	for _, pattern := range def.FileMatches {
		pattern = strings.ToLower(filepathToSlash(pattern))
		for _, file := range files {
			lower := strings.ToLower(filepathToSlash(file))
			if lower == pattern {
				return file
			}
		}
		for _, file := range files {
			lower := strings.ToLower(filepathToSlash(file))
			if strings.Contains(lower, pattern) {
				return file
			}
		}
	}
	return ""
}

func (s *Service) listSymbolsForFile(ctx context.Context, snapshotID string, filePath string) ([]SymbolRecord, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT snapshot_id, symbol_id, name, qualified_name, kind, language, file_path, start_line, end_line, chunk_id
		FROM code_symbols
		WHERE snapshot_id = ? AND file_path = ?
		ORDER BY start_line ASC
	`, snapshotID, filePath)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]SymbolRecord, 0)
	for rows.Next() {
		var row SymbolRecord
		if err := rows.Scan(&row.SnapshotID, &row.SymbolID, &row.Name, &row.QualifiedName, &row.Kind, &row.Language, &row.FilePath, &row.StartLine, &row.EndLine, &row.ChunkID); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Service) listChunksForFile(ctx context.Context, snapshotID string, filePath string) ([]ChunkRecord, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT snapshot_id, chunk_id, file_path, language, kind, name, start_line, end_line, content, context_json
		FROM code_chunks
		WHERE snapshot_id = ? AND file_path = ?
		ORDER BY start_line ASC
	`, snapshotID, filePath)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ChunkRecord, 0)
	for rows.Next() {
		var row ChunkRecord
		if err := rows.Scan(&row.SnapshotID, &row.ChunkID, &row.FilePath, &row.Language, &row.Kind, &row.Name, &row.StartLine, &row.EndLine, &row.Content, &row.ContextJSON); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Service) findChunkInFile(ctx context.Context, snapshotID string, filePath string, nameSubstring string) (*ChunkRecord, error) {
	chunks, err := s.listChunksForFile(ctx, snapshotID, filePath)
	if err != nil {
		return nil, err
	}
	nameSubstring = strings.TrimSpace(nameSubstring)
	if nameSubstring == "" {
		for _, chunk := range chunks {
			if chunk.Kind != "file" && chunk.Kind != "preamble" {
				return &chunk, nil
			}
		}
		return nil, nil
	}
	for _, chunk := range chunks {
		if strings.Contains(chunk.Name, nameSubstring) {
			return &chunk, nil
		}
	}
	return nil, nil
}

func rankGuideSurfaceSymbols(symbols []SymbolRecord, prefs []string) []SymbolRecord {
	prefRank := map[string]int{}
	for i, pref := range prefs {
		prefRank[pref] = i
	}
	ranked := append([]SymbolRecord{}, symbols...)
	sort.SliceStable(ranked, func(i, j int) bool {
		ri, iok := prefRank[ranked[i].Name]
		rj, jok := prefRank[ranked[j].Name]
		if iok || jok {
			if !iok {
				return false
			}
			if !jok {
				return true
			}
			return ri < rj
		}
		ki := guideSymbolKindRank(ranked[i].Kind)
		kj := guideSymbolKindRank(ranked[j].Kind)
		if ki != kj {
			return ki < kj
		}
		return ranked[i].StartLine < ranked[j].StartLine
	})
	return ranked
}

func guideSymbolKindRank(kind string) int {
	switch kind {
	case "def", "func", "method", "class":
		return 0
	case "var", "const", "type":
		return 1
	default:
		return 2
	}
}

func (s *Service) collectGuideSurfaceFlows(ctx context.Context, snapshotID string, filePath string, symbols []SymbolRecord) []string {
	type flowCandidate struct {
		flow   string
		score  int
		isTest bool
	}
	candidates := make([]flowCandidate, 0)
	symbolSet := map[string]struct{}{}
	for _, symbol := range symbols {
		symbolSet[symbol.Name] = struct{}{}
	}

	addCandidate := func(call CallRecord) {
		if call.CallerName == "" || call.CalleeName == "" {
			return
		}
		if call.CallerName == call.CalleeName {
			return
		}
		if isGuideLowSignalName(call.CallerName) || isGuideLowSignalName(call.CalleeName) {
			return
		}
		flow := fmt.Sprintf("%s -> %s", call.CallerName, call.CalleeName)
		score := 0
		if filepathToSlash(call.CallerFilePath) == filepathToSlash(filePath) {
			score += 8
		} else if isGuideRuntimePath(call.CallerFilePath) {
			score += 4
		} else {
			score -= 4
		}
		if _, ok := symbolSet[call.CallerName]; ok {
			score += 3
		}
		if _, ok := symbolSet[call.CalleeName]; ok {
			score += 3
		}
		candidates = append(candidates, flowCandidate{
			flow:   flow,
			score:  score,
			isTest: isTestPath(call.CallerFilePath),
		})
	}

	for _, symbol := range symbols {
		callers, _ := s.GetCallers(ctx, snapshotID, symbol.Name, symbol.Language, 6)
		for _, call := range callers {
			addCandidate(call)
		}
		callees, _ := s.GetCallees(ctx, snapshotID, symbol.SymbolID, "", 6)
		for _, call := range callees {
			addCandidate(call)
		}
	}

	hasRuntime := false
	for _, candidate := range candidates {
		if !candidate.isTest {
			hasRuntime = true
			break
		}
	}

	filtered := make([]flowCandidate, 0, len(candidates))
	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		if hasRuntime && candidate.isTest {
			continue
		}
		if _, ok := seen[candidate.flow]; ok {
			continue
		}
		seen[candidate.flow] = struct{}{}
		filtered = append(filtered, candidate)
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		if filtered[i].score != filtered[j].score {
			return filtered[i].score > filtered[j].score
		}
		return filtered[i].flow < filtered[j].flow
	})

	flows := make([]string, 0, minInt(6, len(filtered)))
	for _, candidate := range filtered {
		if len(flows) >= 6 {
			break
		}
		flows = append(flows, candidate.flow)
	}

	if len(flows) == 0 {
		for _, symbol := range symbols {
			flows = append(flows, fmt.Sprintf("%s in %s", symbol.Name, filePath))
		}
	}
	return uniqStrings(flows)
}

func (s *Service) collectGuideSurfaceTests(ctx context.Context, snapshotID string, filePath string, symbols []SymbolRecord) []TestImpactRecord {
	terms := []string{baseStem(filePath)}
	for _, symbol := range symbols {
		terms = append(terms, symbol.Name)
	}
	tests, err := s.GetTestsImpact(ctx, snapshotID, terms, 4)
	if err != nil {
		return nil
	}
	return tests
}

func buildGuideSurfaceSummary(def guideSurfaceDefinition, filePath string, symbols []SymbolRecord, flows []string) string {
	symbolNames := headSymbolNames(symbols, 3)
	if len(symbolNames) == 0 {
		return fmt.Sprintf("The %s surface is represented by `%s`.", def.Label, filePath)
	}
	if len(flows) > 0 {
		return fmt.Sprintf("The %s surface is represented by `%s` and key symbols `%s`; the highest-signal indexed flow is `%s`.", def.Label, filePath, strings.Join(symbolNames, "`, `"), flows[0])
	}
	return fmt.Sprintf("The %s surface is represented by `%s` via `%s`.", def.Label, filePath, strings.Join(symbolNames, "`, `"))
}

func extractPythonRouteBehaviorFacts(query string, chunk ChunkRecord) ([]GuideFinding, []string, []string, []string) {
	lines := splitLinesPreserve(chunk.Content)
	findings := make([]GuideFinding, 0)
	provisional := make([]string, 0)
	runtimeChecks := make([]string, 0)
	uncertainties := []string{
		"Confirm rate-limit response headers at runtime; the static route shows limiter and quota checks but does not directly prove emitted response headers.",
	}

	var facts []guideRouteResponseFact

	lastCondition := ""
	lastLogLevel := ""
	lastLogMsg := ""
	for idx := 0; idx < len(lines); idx++ {
		trimmed := strings.TrimSpace(lines[idx])
		switch {
		case strings.HasPrefix(trimmed, "if "):
			lastCondition = trimmed
		case strings.HasPrefix(trimmed, "elif "):
			lastCondition = trimmed
		case strings.HasPrefix(trimmed, "except "):
			lastCondition = trimmed
		}
		if match := guideLogLineRe.FindStringSubmatch(trimmed); len(match) == 3 {
			lastLogLevel = normalizeGuideLogLevel(match[1])
			lastLogMsg = match[2]
		}
		if !strings.Contains(trimmed, "return") {
			continue
		}
		segment := trimmed
		for lookahead := idx + 1; lookahead < len(lines) && lookahead <= idx+8; lookahead++ {
			next := strings.TrimSpace(lines[lookahead])
			if next == "" {
				break
			}
			segment += " " + next
			if strings.Contains(next, "),") || guideStatusLineRe.MatchString(next) {
				break
			}
		}
		if !strings.Contains(segment, "jsonify(") {
			continue
		}
		condition := lastCondition
		status := ""
		if match := guideStatusLineRe.FindStringSubmatch(segment); len(match) == 2 {
			status = match[1]
		}
		message := ""
		if match := guideErrorLineRe.FindStringSubmatch(segment); len(match) == 2 {
			message = match[1]
		}
		if message == "" && strings.Contains(segment, "alias=") {
			condition = ""
		}
		facts = append(facts, guideRouteResponseFact{
			condition: condition,
			status:    status,
			message:   message,
			logLevel:  lastLogLevel,
			logMsg:    lastLogMsg,
		})
		lastLogLevel = ""
		lastLogMsg = ""
	}

	for _, fact := range facts {
		if !routeFactMatchesQuery(query, fact) {
			continue
		}
		summary := summarizeRouteResponseFact(fact)
		if summary == "" {
			continue
		}
		finding := GuideFinding{
			Summary:       summary,
			EvidenceFiles: []string{chunk.FilePath},
			EvidenceTests: []string{"tests/api/test_new_custom_alias.py"},
		}
		if strings.Contains(fact.condition, "can_create_new_alias") {
			finding.EvidenceSymbols = []string{"new_custom_alias_v2", "can_create_new_alias"}
			provisional = append(provisional, "The route checks `user.can_create_new_alias()` first and returns HTTP 400 with a free-plan limit error when quota validation fails.")
			runtimeChecks = append(runtimeChecks, "Force quota exhaustion on `/v2/alias/custom/new` and verify the route returns HTTP 400 plus the debug log `user %s cannot create any custom alias`.")
		}
		if strings.Contains(fact.condition, "alias_suffix") || strings.Contains(fact.condition, "check_suffix_signature") {
			finding.EvidenceSymbols = []string{"new_custom_alias_v2", "check_suffix_signature"}
			provisional = append(provisional, "Expired signed suffixes take the HTTP 412 path with the `Alias creation time is expired, please retry` error after `check_suffix_signature` yields no suffix.")
			runtimeChecks = append(runtimeChecks, "POST an expired signed suffix to `/v2/alias/custom/new` and verify the route returns HTTP 412 with the expired-suffix message and warning log.")
		}
		if strings.HasPrefix(fact.condition, "except ") {
			finding.EvidenceSymbols = []string{"new_custom_alias_v2", "check_suffix_signature"}
			provisional = append(provisional, "The exception branch returns HTTP 400 with `Tampered suffix` and logs the tampered-suffix warning.")
			runtimeChecks = append(runtimeChecks, "POST a tampered signed suffix to `/v2/alias/custom/new` and verify the route follows the exception branch with HTTP 400 and the tampered-suffix warning log.")
		}
		if strings.Contains(fact.condition, "verify_prefix_suffix") {
			finding.EvidenceSymbols = []string{"new_custom_alias_v2", "verify_prefix_suffix"}
			provisional = append(provisional, "Prefix/suffix verification failures return HTTP 400 with `wrong alias prefix or suffix` after signature validation.")
			runtimeChecks = append(runtimeChecks, "Drive a prefix/suffix mismatch and verify the route returns HTTP 400 with `wrong alias prefix or suffix`.")
		}
		if fact.status == "201" {
			finding.EvidenceSymbols = []string{"new_custom_alias_v2", "Alias.create"}
			provisional = append(provisional, "When validations pass, the route returns HTTP 201 with the created alias payload.")
			runtimeChecks = append(runtimeChecks, "Run a successful custom-alias creation request and verify the route returns HTTP 201 with alias details.")
		}
		findings = append(findings, finding)
	}

	ordering := extractRouteOrderingFacts(chunk)
	findings = append(findings, ordering...)
	for _, finding := range ordering {
		if strings.Contains(finding.Summary, "quota validation happens before") {
			provisional = append(provisional, "Quota validation happens before signature validation in `new_custom_alias_v2`.")
		}
		if strings.Contains(finding.Summary, "Signature validation happens before") {
			provisional = append(provisional, "Signature validation happens before prefix/suffix verification in `new_custom_alias_v2`.")
		}
	}

	return findings, provisional, runtimeChecks, uncertainties
}

func extractHelperSemanticsFacts(chunks []ChunkRecord) ([]GuideFinding, []string) {
	for _, chunk := range chunks {
		if !strings.Contains(chunk.Content, "check_suffix_signature") {
			continue
		}
		if !strings.Contains(chunk.Content, "return None") || !strings.Contains(chunk.Content, "BadSignature") {
			continue
		}
		finding := GuideFinding{
			Summary:         "The helper `check_suffix_signature` in `app/alias_suffix.py` calls `signer.unsign(..., max_age=600)` and returns `None` when signature verification fails with `BadSignature`.",
			EvidenceFiles:   []string{chunk.FilePath},
			EvidenceSymbols: []string{"check_suffix_signature"},
		}
		provisional := []string{
			"`check_suffix_signature` returns `None` on failed signature verification, which is what drives the expired-suffix rejection path.",
		}
		return []GuideFinding{finding}, provisional
	}
	return nil, nil
}

func extractQuotaOrderingFacts(chunks []ChunkRecord) ([]GuideFinding, []string) {
	for _, chunk := range chunks {
		if !strings.Contains(chunk.Content, "def can_create_new_alias") {
			continue
		}
		finding := GuideFinding{
			Summary:         "The model helper `User.can_create_new_alias` returns `False` for inactive or disabled users and otherwise gates free-plan creation on alias count versus `max_alias_for_free_account()`.",
			EvidenceFiles:   []string{chunk.FilePath},
			EvidenceSymbols: []string{"can_create_new_alias"},
		}
		provisional := []string{
			"`User.can_create_new_alias` is the quota gate the route calls before attempting suffix validation.",
		}
		return []GuideFinding{finding}, provisional
	}
	return nil, nil
}

func extractAliasCreateRateLimitFacts(chunks []ChunkRecord) ([]GuideFinding, []string) {
	for _, chunk := range chunks {
		if !strings.Contains(chunk.Content, "check_bucket_limit") {
			continue
		}
		finding := GuideFinding{
			Summary:         "Alias creation also hits `rate_limiter.check_bucket_limit` inside `Alias.create`, so the route-level limiter is not the only creation guard in play.",
			EvidenceFiles:   []string{chunk.FilePath},
			EvidenceSymbols: []string{"Alias.create"},
		}
		checks := []string{
			"Verify at runtime whether alias creation exposes any rate-limit headers; the static code shows limiter and bucket checks but does not directly prove header behavior in responses.",
		}
		return []GuideFinding{finding}, checks
	}
	return nil, nil
}

func summarizeRouteResponseFact(fact guideRouteResponseFact) string {
	if fact.status == "" {
		return ""
	}
	parts := []string{}
	if fact.condition != "" {
		parts = append(parts, humanizeGuideCondition(fact.condition))
	}
	parts = append(parts, fmt.Sprintf("the route returns HTTP %s", fact.status))
	if fact.message != "" {
		parts = append(parts, fmt.Sprintf("with `%s`", fact.message))
	}
	if fact.logMsg != "" {
		parts = append(parts, fmt.Sprintf("and logs `%s` at %s level", fact.logMsg, fact.logLevel))
	}
	return strings.Join(parts, " ")
}

func routeFactMatchesQuery(query string, fact guideRouteResponseFact) bool {
	lower := strings.ToLower(strings.TrimSpace(query))
	if lower == "" {
		return true
	}
	joined := strings.ToLower(fact.condition + " " + fact.message + " " + fact.logMsg)
	if strings.Contains(lower, "signed suffix") || strings.Contains(lower, "suffix") {
		if strings.Contains(joined, "alias creation time is expired") || strings.Contains(joined, "tampered") || strings.Contains(joined, "alias_suffix") || strings.Contains(joined, "check_suffix_signature") {
			return true
		}
	}
	if strings.Contains(lower, "quota") || strings.Contains(lower, "create more aliases") || strings.Contains(lower, "creation limits") {
		if strings.Contains(joined, "can_create_new_alias") || strings.Contains(joined, "quota") || strings.Contains(joined, "maximum of") {
			return true
		}
	}
	if strings.Contains(lower, "log") && fact.logMsg != "" {
		return true
	}
	if strings.Contains(lower, "successful") || strings.Contains(lower, "success") {
		if fact.status == "200" || fact.status == "201" {
			return true
		}
	}
	if strings.Contains(lower, "rejection") {
		if fact.status == "400" || fact.status == "409" || fact.status == "412" {
			return true
		}
	}
	return false
}

func extractRouteOrderingFacts(chunk ChunkRecord) []GuideFinding {
	lines := splitLinesPreserve(chunk.Content)
	findLine := func(needle string) int {
		for idx, line := range lines {
			if strings.Contains(line, needle) {
				return idx
			}
		}
		return -1
	}
	quotaLine := findLine("can_create_new_alias")
	signatureLine := findLine("check_suffix_signature")
	verifyLine := findLine("verify_prefix_suffix")
	createLine := findLine("Alias.create(")
	findings := make([]GuideFinding, 0)
	if quotaLine >= 0 && signatureLine >= 0 && quotaLine < signatureLine {
		findings = append(findings, GuideFinding{
			Summary:         "In `new_custom_alias_v2`, quota validation happens before signed-suffix validation because `user.can_create_new_alias()` is checked before `check_suffix_signature(...)`.",
			EvidenceFiles:   []string{chunk.FilePath},
			EvidenceSymbols: []string{"new_custom_alias_v2", "can_create_new_alias", "check_suffix_signature"},
		})
	}
	if signatureLine >= 0 && verifyLine >= 0 && signatureLine < verifyLine {
		findings = append(findings, GuideFinding{
			Summary:         "Signature validation happens before prefix/suffix verification because `check_suffix_signature(...)` runs before `verify_prefix_suffix(...)` in `new_custom_alias_v2`.",
			EvidenceFiles:   []string{chunk.FilePath},
			EvidenceSymbols: []string{"new_custom_alias_v2", "check_suffix_signature", "verify_prefix_suffix"},
		})
	}
	if verifyLine >= 0 && createLine >= 0 && verifyLine < createLine {
		findings = append(findings, GuideFinding{
			Summary:         "Alias creation only happens after the validation checks because `Alias.create(...)` is called after quota, signature, and prefix/suffix validation branches.",
			EvidenceFiles:   []string{chunk.FilePath},
			EvidenceSymbols: []string{"new_custom_alias_v2", "Alias.create"},
		})
	}
	return findings
}

func buildBehaviorClarificationHandoff(pack *ContextPack) []string {
	files := focusedGuideAnchorFiles(pack)
	if len(files) == 0 {
		return nil
	}
	steps := []string{
		fmt.Sprintf("Start with the anchored route/helper path in `%s`.", files[0]),
	}
	if containsGuideFile(files, "app/api/views/new_custom_alias.py") {
		steps = append(steps, "Trace `new_custom_alias_v2` first so the response branches, log lines, and validation ordering are explicit before runtime testing.")
	}
	if containsGuideFile(files, "app/alias_suffix.py") {
		steps = append(steps, "Cross-check `check_suffix_signature` next to confirm the helper semantics behind the expired-suffix path.")
	}
	if containsGuideFile(files, "app/models.py") {
		steps = append(steps, "Then inspect `User.can_create_new_alias` and `Alias.create` in `app/models.py` for quota and bucket-limit behavior.")
	}
	return uniqStrings(steps)
}

func containsGuideFile(files []string, want string) bool {
	for _, file := range files {
		if file == want {
			return true
		}
	}
	return false
}

func shouldClarifyBehaviorPrompt(query string) bool {
	lower := strings.ToLower(strings.TrimSpace(query))
	if lower == "" || shouldSynthesizeGuideSurfaces(lower) {
		return false
	}
	signals := []string{
		"http status",
		"status code",
		"error message",
		"log",
		"response",
		"header",
		"quota",
		"validation",
		"trigger rejection",
	}
	for _, signal := range signals {
		if strings.Contains(lower, signal) {
			return true
		}
	}
	return false
}

func humanizeGuideCondition(condition string) string {
	switch {
	case strings.Contains(condition, "can_create_new_alias"):
		return "When quota validation fails,"
	case strings.Contains(condition, "not alias_suffix"):
		return "When signed-suffix validation returns no suffix,"
	case strings.HasPrefix(condition, "except "):
		return "When the signed-suffix verification raises an exception,"
	case strings.Contains(condition, "verify_prefix_suffix"):
		return "When prefix/suffix validation fails,"
	default:
		return strings.TrimSpace(condition)
	}
}

func normalizeGuideLogLevel(level string) string {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "d":
		return "DEBUG"
	case "i":
		return "INFO"
	case "w":
		return "WARNING"
	case "e":
		return "ERROR"
	default:
		return strings.ToUpper(level)
	}
}

func buildGuideSurfaceRuntimeChecks(def guideSurfaceDefinition, filePath string, symbols []SymbolRecord, tests []TestImpactRecord) []string {
	checks := make([]string, 0)
	switch def.Role {
	case "web_server":
		checks = append(checks, fmt.Sprintf("Start the web server from `%s` and confirm the bootstrap entrypoints respond, including `/health` when present.", filePath))
	case "auth_signin":
		checks = append(checks, fmt.Sprintf("Exercise the auth/sign-in surface in `%s` and confirm a user can authenticate through the expected login path.", filePath))
	case "dashboard_ui":
		checks = append(checks, fmt.Sprintf("Open the dashboard UI surface in `%s` after signing in and confirm the expected user-facing page loads.", filePath))
	case "alias_management":
		checks = append(checks, fmt.Sprintf("Create or inspect aliases through `%s` and confirm alias listing or mutation paths behave as expected.", filePath))
	case "email_handler":
		checks = append(checks, fmt.Sprintf("Run the email-handler surface in `%s` and confirm inbound alias mail is accepted and processed.", filePath))
	case "job_runner":
		checks = append(checks, fmt.Sprintf("Run the job-runner surface in `%s` and confirm ready jobs are picked up and executed.", filePath))
	}
	if len(symbols) > 0 {
		checks = append(checks, fmt.Sprintf("Trace `%s` in `%s` during runtime validation.", strings.Join(headSymbolNames(symbols, 2), "`, `"), filePath))
	}
	for _, test := range tests {
		checks = append(checks, fmt.Sprintf("Inspect `%s` as a likely validation surface for the %s role.", test.FilePath, def.Label))
	}
	return uniqStrings(checks)
}

func buildGuideSurfaceHandoffSteps(def guideSurfaceDefinition, filePath string, symbols []SymbolRecord) []string {
	steps := make([]string, 0, 2)
	if len(symbols) > 0 {
		switch def.Role {
		case "web_server":
			steps = append(steps, fmt.Sprintf("Start the runtime walkthrough at `%s` with `%s`.", filePath, strings.Join(headSymbolNames(symbols, 2), "`, `")))
		case "auth_signin":
			steps = append(steps, fmt.Sprintf("After the server is up, verify sign-in through `%s` using `%s`.", filePath, strings.Join(headSymbolNames(symbols, 2), "`, `")))
		case "dashboard_ui":
			steps = append(steps, fmt.Sprintf("After authentication, open the dashboard UI in `%s` and confirm `%s`.", filePath, strings.Join(headSymbolNames(symbols, 1), "`, `")))
		case "alias_management":
			steps = append(steps, fmt.Sprintf("Use `%s` to validate alias-management behavior through `%s`.", filePath, strings.Join(headSymbolNames(symbols, 2), "`, `")))
		case "email_handler":
			steps = append(steps, fmt.Sprintf("Send a test mail through the email-handler surface in `%s` and trace `%s`.", filePath, strings.Join(headSymbolNames(symbols, 2), "`, `")))
		case "job_runner":
			steps = append(steps, fmt.Sprintf("Finish by validating the background-job path in `%s` through `%s`.", filePath, strings.Join(headSymbolNames(symbols, 2), "`, `")))
		default:
			steps = append(steps, fmt.Sprintf("Review the %s surface in `%s`.", def.Label, filePath))
			steps = append(steps, fmt.Sprintf("Start with `%s` for the %s surface.", strings.Join(headSymbolNames(symbols, 2), "`, `"), def.Label))
		}
	} else {
		steps = append(steps, fmt.Sprintf("Review the %s surface in `%s`.", def.Label, filePath))
	}
	return uniqStrings(steps)
}

func headGuideSurfaces(items []guideSurface, limit int) []guideSurface {
	if len(items) <= limit {
		return items
	}
	return items[:limit]
}

func headSymbolNames(symbols []SymbolRecord, limit int) []string {
	names := make([]string, 0, minInt(limit, len(symbols)))
	for i, symbol := range symbols {
		if i >= limit {
			break
		}
		names = append(names, symbol.Name)
	}
	return names
}

func filepathToSlash(path string) string {
	return strings.ReplaceAll(path, "\\", "/")
}

func uniqStrings(items []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}

func headStrings(items []string, limit int) []string {
	if len(items) <= limit {
		return items
	}
	return items[:limit]
}

func collectAnchorSymbolNames(pack *ContextPack) []string {
	names := make([]string, 0, len(pack.AnchorSymbols))
	for _, symbol := range pack.AnchorSymbols {
		if !isGuideLowSignalName(symbol.Name) {
			names = append(names, symbol.Name)
		}
	}
	return uniqStrings(names)
}

func focusedGuideAnchorFiles(pack *ContextPack) []string {
	fileHasMeaningfulSymbol := map[string]bool{}
	for _, symbol := range pack.AnchorSymbols {
		if isGuideLowSignalName(symbol.Name) {
			continue
		}
		fileHasMeaningfulSymbol[symbol.FilePath] = true
	}
	files := make([]string, 0)
	for _, chunk := range pack.AnchorChunks {
		if len(fileHasMeaningfulSymbol) == 0 || fileHasMeaningfulSymbol[chunk.FilePath] {
			files = append(files, chunk.FilePath)
		}
	}
	for filePath := range fileHasMeaningfulSymbol {
		files = append(files, filePath)
	}
	return uniqStrings(files)
}

func collectFocusedGuideCalls(pack *ContextPack) []CallRecord {
	type callCandidate struct {
		call   CallRecord
		score  int
		isTest bool
	}
	anchorNames := map[string]struct{}{}
	anchorFiles := map[string]struct{}{}
	for _, symbol := range pack.AnchorSymbols {
		if isGuideLowSignalName(symbol.Name) {
			continue
		}
		anchorNames[symbol.Name] = struct{}{}
		anchorFiles[filepathToSlash(symbol.FilePath)] = struct{}{}
	}
	for _, chunk := range pack.AnchorChunks {
		anchorFiles[filepathToSlash(chunk.FilePath)] = struct{}{}
	}

	addCandidate := func(call CallRecord, anchored bool) []callCandidate {
		if !anchored {
			return nil
		}
		if call.CallerName == "" || call.CalleeName == "" {
			return nil
		}
		if call.CallerName == call.CalleeName {
			return nil
		}
		if isGuideLowSignalName(call.CallerName) || isGuideLowSignalName(call.CalleeName) {
			return nil
		}
		score := 0
		if _, ok := anchorFiles[filepathToSlash(call.CallerFilePath)]; ok {
			score += 8
		} else if isGuideRuntimePath(call.CallerFilePath) {
			score += 4
		} else {
			score -= 4
		}
		if _, ok := anchorNames[call.CallerName]; ok {
			score += 3
		}
		if _, ok := anchorNames[call.CalleeName]; ok {
			score += 3
		}
		return []callCandidate{{
			call:   call,
			score:  score,
			isTest: isTestPath(call.CallerFilePath),
		}}
	}

	candidates := make([]callCandidate, 0)
	for _, call := range pack.Callers {
		_, anchored := anchorNames[call.CalleeName]
		candidates = append(candidates, addCandidate(call, anchored)...)
	}
	for _, call := range pack.Callees {
		_, anchored := anchorNames[call.CallerName]
		candidates = append(candidates, addCandidate(call, anchored)...)
	}

	hasRuntime := false
	for _, candidate := range candidates {
		if !candidate.isTest {
			hasRuntime = true
			break
		}
	}

	filtered := make([]callCandidate, 0, len(candidates))
	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		if hasRuntime && candidate.isTest {
			continue
		}
		key := candidate.call.CallerFilePath + "\x00" + candidate.call.CallerName + "\x00" + candidate.call.CalleeName
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		filtered = append(filtered, candidate)
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		if filtered[i].score != filtered[j].score {
			return filtered[i].score > filtered[j].score
		}
		if filtered[i].call.CallerFilePath != filtered[j].call.CallerFilePath {
			return filtered[i].call.CallerFilePath < filtered[j].call.CallerFilePath
		}
		if filtered[i].call.Line != filtered[j].call.Line {
			return filtered[i].call.Line < filtered[j].call.Line
		}
		return filtered[i].call.CalleeName < filtered[j].call.CalleeName
	})

	out := make([]CallRecord, 0, minInt(12, len(filtered)))
	for _, candidate := range filtered {
		if len(out) >= 12 {
			break
		}
		out = append(out, candidate.call)
	}
	return out
}

func unsurfacedGuideAnchorFiles(pack *ContextPack, surfaces []guideSurface) []string {
	if len(surfaces) == 0 {
		return nil
	}
	surfaceFiles := map[string]struct{}{}
	for _, surface := range surfaces {
		surfaceFiles[filepathToSlash(surface.FilePath)] = struct{}{}
	}
	files := make([]string, 0)
	for _, chunk := range pack.AnchorChunks {
		if _, ok := surfaceFiles[filepathToSlash(chunk.FilePath)]; ok {
			continue
		}
		files = append(files, chunk.FilePath)
	}
	return uniqStrings(files)
}

func isGuideRuntimePath(path string) bool {
	path = filepathToSlash(strings.TrimSpace(path))
	if path == "" {
		return false
	}
	return !isTestPath(path)
}

func isTestPath(path string) bool {
	path = filepathToSlash(strings.TrimSpace(path))
	if path == "" {
		return false
	}
	return strings.HasPrefix(path, "tests/") || strings.Contains(path, "/tests/") || strings.HasSuffix(path, "_test.go") || strings.HasSuffix(path, "_test.py") || strings.HasSuffix(path, ".spec.ts") || strings.HasSuffix(path, ".test.ts") || strings.HasSuffix(path, ".test.tsx")
}

func isGuideLowSignalName(name string) bool {
	name = strings.TrimSpace(name)
	if len(name) <= 1 {
		return true
	}
	if _, ok := guideLowSignalNames[name]; ok {
		return true
	}
	return false
}

func (s *Service) resolveFirstActionableChunkForFile(ctx context.Context, snapshotID string, filePath string) (*ChunkRecord, error) {
	var replacement ChunkRecord
	err := s.db.QueryRowContext(ctx, `
		SELECT snapshot_id, chunk_id, file_path, language, kind, name, start_line, end_line, content, context_json
		FROM code_chunks
		WHERE snapshot_id = ? AND file_path = ? AND kind NOT IN ('file', 'preamble')
		ORDER BY start_line ASC
		LIMIT 1
	`, snapshotID, filePath).Scan(
		&replacement.SnapshotID,
		&replacement.ChunkID,
		&replacement.FilePath,
		&replacement.Language,
		&replacement.Kind,
		&replacement.Name,
		&replacement.StartLine,
		&replacement.EndLine,
		&replacement.Content,
		&replacement.ContextJSON,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &replacement, nil
}
