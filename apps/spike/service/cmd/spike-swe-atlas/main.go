package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	defaultDatasetURL = "https://huggingface.co/datasets/ScaleAI/SWE-Atlas-QnA/resolve/main/data/test/cae_qna_124_public.csv"
	defaultWorkRoot   = ".swe-atlas-qna"
)

type taskRecord struct {
	TaskID               string `json:"task_id"`
	Prompt               string `json:"prompt"`
	ReferenceAnswer      string `json:"reference_answer"`
	RepositoryURL        string `json:"repository_url"`
	RepositoryBaseCommit string `json:"repository_base_commit"`
	Language             string `json:"language"`
	Category             string `json:"category"`
	RubricRaw            string `json:"-"`
	DockerImage          string `json:"docker_image"`
}

type taskBundle struct {
	Task        taskRecord       `json:"task"`
	Rubric      []map[string]any `json:"rubric"`
	RepoKey     string           `json:"repo_key"`
	RepoDir     string           `json:"repo_dir"`
	TaskDir     string           `json:"task_dir"`
	WorkRoot    string           `json:"work_root"`
	DatasetPath string           `json:"dataset_path"`
}

type prepareMetadata struct {
	TaskID               string    `json:"task_id"`
	RepositoryURL        string    `json:"repository_url"`
	RepositoryBaseCommit string    `json:"repository_base_commit"`
	DockerImage          string    `json:"docker_image"`
	RepoDir              string    `json:"repo_dir"`
	PreparedAt           time.Time `json:"prepared_at"`
}

type spikeStatus struct {
	TreeID string `json:"tree_id"`
	Nodes  []struct {
		Status string `json:"status"`
	} `json:"nodes"`
}

type spikeAnswer struct {
	TreeID  string   `json:"tree_id"`
	Query   string   `json:"query"`
	Content string   `json:"content"`
	Visited []string `json:"visited,omitempty"`
}

type runMetadata struct {
	TaskID               string      `json:"task_id"`
	TreeID               string      `json:"tree_id"`
	SpikeBin             string      `json:"spike_bin"`
	SpikeStorageRoot     string      `json:"spike_storage_root"`
	RepoDir              string      `json:"repo_dir"`
	PromptPath           string      `json:"prompt_path"`
	AnswerPath           string      `json:"answer_path"`
	AnswerJSONPath       string      `json:"answer_json_path"`
	RepositoryURL        string      `json:"repository_url"`
	RepositoryBaseCommit string      `json:"repository_base_commit"`
	DockerImage          string      `json:"docker_image"`
	StartedAt            time.Time   `json:"started_at"`
	CompletedAt          time.Time   `json:"completed_at"`
	Answer               spikeAnswer `json:"answer"`
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	var err error
	switch os.Args[1] {
	case "task":
		err = cmdTask(os.Args[2:])
	case "prepare":
		err = cmdPrepare(os.Args[2:])
	case "run":
		err = cmdRun(os.Args[2:])
	default:
		usage()
		os.Exit(2)
	}

	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Println("spike-swe-atlas task --task-id <id> [--work-root DIR --dataset-url URL --json]")
	fmt.Println("spike-swe-atlas prepare --task-id <id> [--work-root DIR --dataset-url URL --json]")
	fmt.Println("spike-swe-atlas run --task-id <id> [--work-root DIR --dataset-url URL --spike-bin PATH --spike-storage-root DIR --tree-id ID --json]")
}

func cmdTask(args []string) error {
	fs := flag.NewFlagSet("task", flag.ContinueOnError)
	taskID := fs.String("task-id", "", "SWE-Atlas task ID")
	workRoot := fs.String("work-root", defaultWorkRoot, "Runner workspace root")
	datasetURL := fs.String("dataset-url", defaultDatasetURL, "Dataset CSV URL")
	jsonOut := fs.Bool("json", false, "Emit JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*taskID) == "" {
		return fmt.Errorf("--task-id is required")
	}

	bundle, err := loadTaskBundle(*workRoot, *datasetURL, *taskID)
	if err != nil {
		return err
	}
	if *jsonOut {
		return writeJSON(os.Stdout, bundle)
	}

	fmt.Printf("task_id: %s\n", bundle.Task.TaskID)
	fmt.Printf("category: %s\n", bundle.Task.Category)
	fmt.Printf("language: %s\n", bundle.Task.Language)
	fmt.Printf("repository: %s\n", bundle.Task.RepositoryURL)
	fmt.Printf("base_commit: %s\n", bundle.Task.RepositoryBaseCommit)
	fmt.Printf("docker_image: %s\n", bundle.Task.DockerImage)
	fmt.Printf("rubric_items: %d\n", len(bundle.Rubric))
	fmt.Printf("repo_key: %s\n", bundle.RepoKey)
	fmt.Println()
	fmt.Println(strings.TrimSpace(bundle.Task.Prompt))
	return nil
}

func cmdPrepare(args []string) error {
	fs := flag.NewFlagSet("prepare", flag.ContinueOnError)
	taskID := fs.String("task-id", "", "SWE-Atlas task ID")
	workRoot := fs.String("work-root", defaultWorkRoot, "Runner workspace root")
	datasetURL := fs.String("dataset-url", defaultDatasetURL, "Dataset CSV URL")
	jsonOut := fs.Bool("json", false, "Emit JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*taskID) == "" {
		return fmt.Errorf("--task-id is required")
	}

	bundle, err := prepareTask(*workRoot, *datasetURL, *taskID)
	if err != nil {
		return err
	}
	if *jsonOut {
		return writeJSON(os.Stdout, bundle)
	}

	fmt.Printf("prepared task %s\n", bundle.Task.TaskID)
	fmt.Printf("repo_dir: %s\n", bundle.RepoDir)
	fmt.Printf("task_dir: %s\n", bundle.TaskDir)
	fmt.Printf("prompt: %s\n", filepath.Join(bundle.TaskDir, "prompt.txt"))
	fmt.Printf("reference_answer: %s\n", filepath.Join(bundle.TaskDir, "reference_answer.md"))
	fmt.Printf("rubric: %s\n", filepath.Join(bundle.TaskDir, "rubric.json"))
	return nil
}

func cmdRun(args []string) error {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	taskID := fs.String("task-id", "", "SWE-Atlas task ID")
	workRoot := fs.String("work-root", defaultWorkRoot, "Runner workspace root")
	datasetURL := fs.String("dataset-url", defaultDatasetURL, "Dataset CSV URL")
	spikeBin := fs.String("spike-bin", defaultSpikeBin(), "Path to spike-engine binary")
	spikeStorageRoot := fs.String("spike-storage-root", "", "Spike storage root (defaults to <work-root>/spike/<repo-key>)")
	treeID := fs.String("tree-id", "", "Spike tree ID (defaults to repo-key)")
	jsonOut := fs.Bool("json", false, "Emit JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*taskID) == "" {
		return fmt.Errorf("--task-id is required")
	}

	startedAt := time.Now().UTC()
	bundle, err := prepareTask(*workRoot, *datasetURL, *taskID)
	if err != nil {
		return err
	}

	actualTreeID := strings.TrimSpace(*treeID)
	if actualTreeID == "" {
		actualTreeID = bundle.RepoKey
	}

	actualSpikeStorageRoot := strings.TrimSpace(*spikeStorageRoot)
	if actualSpikeStorageRoot == "" {
		actualSpikeStorageRoot = filepath.Join(bundle.WorkRoot, "spike", bundle.RepoKey)
	}

	if err := ensureTreeReady(*spikeBin, actualSpikeStorageRoot, actualTreeID, bundle.RepoDir); err != nil {
		return err
	}

	answer, err := askSpike(*spikeBin, actualSpikeStorageRoot, actualTreeID, bundle.Task.Prompt)
	if err != nil {
		return err
	}

	runDir := filepath.Join(bundle.TaskDir, "runs", time.Now().UTC().Format("20060102-150405"))
	if err := os.MkdirAll(runDir, 0o755); err != nil {
		return err
	}

	answerPath := filepath.Join(runDir, "answer.md")
	answerJSONPath := filepath.Join(runDir, "answer.json")
	if err := os.WriteFile(answerPath, []byte(strings.TrimSpace(answer.Content)+"\n"), 0o644); err != nil {
		return err
	}
	if err := writeJSONFile(answerJSONPath, answer); err != nil {
		return err
	}

	run := runMetadata{
		TaskID:               bundle.Task.TaskID,
		TreeID:               actualTreeID,
		SpikeBin:             *spikeBin,
		SpikeStorageRoot:     actualSpikeStorageRoot,
		RepoDir:              bundle.RepoDir,
		PromptPath:           filepath.Join(bundle.TaskDir, "prompt.txt"),
		AnswerPath:           answerPath,
		AnswerJSONPath:       answerJSONPath,
		RepositoryURL:        bundle.Task.RepositoryURL,
		RepositoryBaseCommit: bundle.Task.RepositoryBaseCommit,
		DockerImage:          bundle.Task.DockerImage,
		StartedAt:            startedAt,
		CompletedAt:          time.Now().UTC(),
		Answer:               answer,
	}
	runPath := filepath.Join(runDir, "run.json")
	if err := writeJSONFile(runPath, run); err != nil {
		return err
	}

	if *jsonOut {
		return writeJSON(os.Stdout, run)
	}

	fmt.Printf("task_id: %s\n", run.TaskID)
	fmt.Printf("tree_id: %s\n", run.TreeID)
	fmt.Printf("repo_dir: %s\n", run.RepoDir)
	fmt.Printf("answer: %s\n", run.AnswerPath)
	fmt.Println()
	fmt.Println(strings.TrimSpace(run.Answer.Content))
	return nil
}

func loadTaskBundle(workRoot, datasetURL, taskID string) (*taskBundle, error) {
	workRoot, err := filepath.Abs(workRoot)
	if err != nil {
		return nil, err
	}
	datasetPath, err := ensureDatasetCached(workRoot, datasetURL)
	if err != nil {
		return nil, err
	}
	task, rubric, err := findTask(datasetPath, taskID)
	if err != nil {
		return nil, err
	}
	repoKey := buildRepoKey(task.RepositoryURL, task.RepositoryBaseCommit)
	taskDir := filepath.Join(workRoot, "tasks", task.TaskID)
	repoDir := filepath.Join(workRoot, "repos", repoKey)
	return &taskBundle{
		Task:        task,
		Rubric:      rubric,
		RepoKey:     repoKey,
		RepoDir:     repoDir,
		TaskDir:     taskDir,
		WorkRoot:    workRoot,
		DatasetPath: datasetPath,
	}, nil
}

func prepareTask(workRoot, datasetURL, taskID string) (*taskBundle, error) {
	bundle, err := loadTaskBundle(workRoot, datasetURL, taskID)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(bundle.TaskDir, 0o755); err != nil {
		return nil, err
	}
	if err := materializeRepo(bundle.Task.DockerImage, bundle.Task.RepositoryBaseCommit, bundle.RepoDir); err != nil {
		return nil, err
	}
	if err := writeJSONFile(filepath.Join(bundle.TaskDir, "task.json"), bundle.Task); err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(bundle.TaskDir, "prompt.txt"), []byte(strings.TrimSpace(bundle.Task.Prompt)+"\n"), 0o644); err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(bundle.TaskDir, "reference_answer.md"), []byte(strings.TrimSpace(bundle.Task.ReferenceAnswer)+"\n"), 0o644); err != nil {
		return nil, err
	}
	if err := writeJSONFile(filepath.Join(bundle.TaskDir, "rubric.json"), bundle.Rubric); err != nil {
		return nil, err
	}
	meta := prepareMetadata{
		TaskID:               bundle.Task.TaskID,
		RepositoryURL:        bundle.Task.RepositoryURL,
		RepositoryBaseCommit: bundle.Task.RepositoryBaseCommit,
		DockerImage:          bundle.Task.DockerImage,
		RepoDir:              bundle.RepoDir,
		PreparedAt:           time.Now().UTC(),
	}
	if err := writeJSONFile(filepath.Join(bundle.TaskDir, "prepare.json"), meta); err != nil {
		return nil, err
	}
	return bundle, nil
}

func ensureDatasetCached(workRoot, datasetURL string) (string, error) {
	cacheDir := filepath.Join(workRoot, "cache")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		return "", err
	}
	datasetPath := filepath.Join(cacheDir, "cae_qna_124_public.csv")
	if _, err := os.Stat(datasetPath); err == nil {
		return datasetPath, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, datasetURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("dataset download failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(datasetPath, data, 0o644); err != nil {
		return "", err
	}
	return datasetPath, nil
}

func findTask(datasetPath, taskID string) (taskRecord, []map[string]any, error) {
	file, err := os.Open(datasetPath)
	if err != nil {
		return taskRecord{}, nil, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1
	rows, err := reader.ReadAll()
	if err != nil {
		return taskRecord{}, nil, err
	}
	if len(rows) < 2 {
		return taskRecord{}, nil, fmt.Errorf("dataset is empty: %s", datasetPath)
	}

	header := rows[0]
	index := map[string]int{}
	for i, name := range header {
		index[name] = i
	}

	required := []string{
		"task_id",
		"prompt",
		"reference_answer",
		"repository_url",
		"repository_base_commit",
		"language",
		"category",
		"rubric",
		"docker_image",
	}
	for _, field := range required {
		if _, ok := index[field]; !ok {
			return taskRecord{}, nil, fmt.Errorf("dataset missing column %q", field)
		}
	}

	for _, row := range rows[1:] {
		if len(row) <= index["task_id"] {
			continue
		}
		if strings.TrimSpace(row[index["task_id"]]) != taskID {
			continue
		}
		task := taskRecord{
			TaskID:               strings.TrimSpace(row[index["task_id"]]),
			Prompt:               row[index["prompt"]],
			ReferenceAnswer:      row[index["reference_answer"]],
			RepositoryURL:        strings.TrimSpace(row[index["repository_url"]]),
			RepositoryBaseCommit: strings.TrimSpace(row[index["repository_base_commit"]]),
			Language:             strings.TrimSpace(row[index["language"]]),
			Category:             strings.TrimSpace(row[index["category"]]),
			RubricRaw:            row[index["rubric"]],
			DockerImage:          strings.TrimSpace(row[index["docker_image"]]),
		}
		var rubric []map[string]any
		if err := json.Unmarshal([]byte(task.RubricRaw), &rubric); err != nil {
			return taskRecord{}, nil, fmt.Errorf("parse rubric for %s: %w", taskID, err)
		}
		return task, rubric, nil
	}

	return taskRecord{}, nil, fmt.Errorf("task not found: %s", taskID)
}

func materializeRepo(dockerImage, baseCommit, repoDir string) error {
	if strings.TrimSpace(dockerImage) == "" {
		return fmt.Errorf("task missing docker_image")
	}
	if strings.TrimSpace(baseCommit) == "" {
		return fmt.Errorf("task missing repository_base_commit")
	}
	if _, err := exec.LookPath("docker"); err != nil {
		return fmt.Errorf("docker is required to prepare SWE-Atlas repos: %w", err)
	}
	if out, err := exec.Command("docker", "info").CombinedOutput(); err != nil {
		return fmt.Errorf("docker daemon is required to prepare SWE-Atlas repos; start Docker Desktop or another local daemon: %s", strings.TrimSpace(string(out)))
	}

	if head, err := gitOutput(repoDir, "rev-parse", "HEAD"); err == nil && strings.TrimSpace(string(head)) == strings.TrimSpace(baseCommit) {
		return nil
	}

	if err := os.RemoveAll(repoDir); err != nil {
		return err
	}
	if err := os.MkdirAll(repoDir, 0o755); err != nil {
		return err
	}

	containerIDBytes, err := exec.Command("docker", "create", dockerImage, "sh").CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker create failed: %s", strings.TrimSpace(string(containerIDBytes)))
	}
	containerID := strings.TrimSpace(string(containerIDBytes))
	if containerID == "" {
		return errors.New("docker create returned empty container id")
	}
	defer exec.Command("docker", "rm", "-f", containerID).Run()

	cpCmd := exec.Command("docker", "cp", containerID+":/app/.", repoDir)
	if out, err := cpCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("docker cp failed: %s", strings.TrimSpace(string(out)))
	}

	if _, err := os.Stat(filepath.Join(repoDir, ".git")); err != nil {
		return fmt.Errorf("prepared repo is missing .git metadata: %s", repoDir)
	}

	if _, err := gitOutput(repoDir, "config", "--global", "--add", "safe.directory", repoDir); err != nil {
		// Non-fatal. Continue and let later git commands surface any real issue.
	}
	if _, err := gitOutput(repoDir, "restore", "."); err != nil {
		return fmt.Errorf("git restore failed: %w", err)
	}
	if _, err := gitOutput(repoDir, "reset", "--hard", baseCommit); err != nil {
		return fmt.Errorf("git reset failed: %w", err)
	}
	if _, err := gitOutput(repoDir, "clean", "-fdq"); err != nil {
		return fmt.Errorf("git clean failed: %w", err)
	}
	return nil
}

func ensureTreeReady(spikeBin, storageRoot, treeID, repoDir string) error {
	storageRoot, err := filepath.Abs(storageRoot)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(storageRoot, 0o755); err != nil {
		return err
	}

	status, err := spikeTreeStatus(spikeBin, storageRoot, treeID)
	if err != nil {
		if err := runSpike(spikeBin, "init", "--storage-root", storageRoot, "--scope", repoDir, "--tree-id", treeID); err != nil {
			return err
		}
		return runSpike(spikeBin, "hydrate", "--storage-root", storageRoot, "--tree-id", treeID)
	}

	if !allNodesReady(status) {
		return runSpike(spikeBin, "hydrate", "--storage-root", storageRoot, "--tree-id", treeID)
	}
	return nil
}

func spikeTreeStatus(spikeBin, storageRoot, treeID string) (*spikeStatus, error) {
	out, err := runSpikeJSON(spikeBin, "status", "--storage-root", storageRoot, "--tree-id", treeID)
	if err != nil {
		return nil, err
	}
	var status spikeStatus
	if err := json.Unmarshal(out, &status); err != nil {
		return nil, fmt.Errorf("parse spike status: %w", err)
	}
	return &status, nil
}

func allNodesReady(status *spikeStatus) bool {
	if status == nil || len(status.Nodes) == 0 {
		return false
	}
	for _, node := range status.Nodes {
		if strings.TrimSpace(node.Status) != "ready" {
			return false
		}
	}
	return true
}

func askSpike(spikeBin, storageRoot, treeID, prompt string) (spikeAnswer, error) {
	out, err := runSpikeJSON(spikeBin, "ask", "--storage-root", storageRoot, "--tree-id", treeID, "--json", prompt)
	if err != nil {
		return spikeAnswer{}, err
	}
	var answer spikeAnswer
	if err := json.Unmarshal(out, &answer); err != nil {
		return spikeAnswer{}, fmt.Errorf("parse spike answer: %w", err)
	}
	return answer, nil
}

func runSpike(spikeBin string, args ...string) error {
	_, err := runSpikeJSON(spikeBin, args...)
	return err
}

func runSpikeJSON(spikeBin string, args ...string) ([]byte, error) {
	cmd := exec.Command(spikeBin, args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = strings.TrimSpace(stdout.String())
		}
		if message == "" {
			message = err.Error()
		}
		return nil, fmt.Errorf("%s %s failed: %s", spikeBin, strings.Join(args, " "), message)
	}
	return bytes.TrimSpace(stdout.Bytes()), nil
}

func gitOutput(dir string, args ...string) ([]byte, error) {
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return out, fmt.Errorf("%s", strings.TrimSpace(string(out)))
	}
	return out, nil
}

func writeJSONFile(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}

func writeJSON(w io.Writer, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	_, err = fmt.Fprintln(w, string(data))
	return err
}

func defaultSpikeBin() string {
	if value := strings.TrimSpace(os.Getenv("SPIKE_BIN")); value != "" {
		return value
	}
	candidates := []string{
		"./spike-engine",
		"spike-engine",
	}
	for _, candidate := range candidates {
		if strings.Contains(candidate, string(os.PathSeparator)) {
			if _, err := os.Stat(candidate); err == nil {
				return candidate
			}
			continue
		}
		if _, err := exec.LookPath(candidate); err == nil {
			return candidate
		}
	}
	return "spike-engine"
}

func buildRepoKey(rawURL, commit string) string {
	slug := "repo"
	if parsed, err := url.Parse(rawURL); err == nil {
		pathParts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
		if len(pathParts) >= 2 {
			slug = sanitizeName(pathParts[len(pathParts)-2] + "-" + pathParts[len(pathParts)-1])
		}
	}
	shortCommit := strings.TrimSpace(commit)
	if len(shortCommit) > 12 {
		shortCommit = shortCommit[:12]
	}
	shortCommit = sanitizeName(shortCommit)
	if shortCommit == "" {
		return slug
	}
	return slug + "-" + shortCommit
}

var invalidNameChars = regexp.MustCompile(`[^a-z0-9._-]+`)

func sanitizeName(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, " ", "-")
	value = invalidNameChars.ReplaceAllString(value, "-")
	value = strings.Trim(value, "-.")
	value = strings.ReplaceAll(value, "--", "-")
	if value == "" {
		return "value"
	}
	return value
}
