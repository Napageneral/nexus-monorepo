package gitadapter

import "errors"

var (
	ErrNotImplemented  = errors.New("not implemented")
	ErrUnknownProvider = errors.New("unknown provider")
)

type AccountsFile struct {
	Accounts map[string]AccountConfig `json:"accounts"`
}

type Watermark struct {
	Source    string
	Name      string
	ValueInt  int64
	ValueText string
	UpdatedTS int64
}

type AccountConfig struct {
	AccountID           string       `json:"account_id,omitempty"`
	Provider            string       `json:"provider"`
	Host                string       `json:"host"`
	Token               string       `json:"token,omitempty"`
	Username            string       `json:"username,omitempty"`
	Workspace           string       `json:"workspace,omitempty"`
	CredentialRef       string       `json:"credential_ref,omitempty"`
	Repositories        []Repository `json:"repositories"`
	PollIntervalSeconds int          `json:"poll_interval_seconds"`
	BackfillSince       string       `json:"backfill_since,omitempty"`
}

type Repository struct {
	ID              string   `json:"id"`
	FullName        string   `json:"full_name"`
	Name            string   `json:"name"`
	RemoteURL       string   `json:"remote_url,omitempty"`
	DefaultBranch   string   `json:"default_branch"`
	TrackedBranches []string `json:"tracked_branches"`
}

type Commit struct {
	SHA         string     `json:"sha"`
	Message     string     `json:"message"`
	AuthorEmail string     `json:"author_email"`
	AuthorName  string     `json:"author_name"`
	Timestamp   int64      `json:"timestamp"`
	Parents     []string   `json:"parents"`
	Refs        []string   `json:"refs"`
	Repo        Repository `json:"repo"`
}

type PullRequest struct {
	ID            string     `json:"id"`
	Title         string     `json:"title"`
	Description   string     `json:"description"`
	State         string     `json:"state"`
	AuthorEmail   string     `json:"author_email"`
	AuthorName    string     `json:"author_name"`
	HeadCommitSHA string     `json:"head_commit_sha,omitempty"`
	SourceBranch  string     `json:"source_branch"`
	TargetBranch  string     `json:"target_branch"`
	Reviewers     []string   `json:"reviewers"`
	CreatedAt     int64      `json:"created_at"`
	UpdatedAt     int64      `json:"updated_at"`
	Repo          Repository `json:"repo"`
}

type PullRequestListOptions struct {
	States  []string `json:"states,omitempty"`
	PageLen int      `json:"page_len,omitempty"`
	Page    int      `json:"page,omitempty"`
}

type PullRequestListPage struct {
	PullRequests []PullRequest `json:"pull_requests"`
	Next         string        `json:"next,omitempty"`
	Page         int           `json:"page,omitempty"`
	PageLen      int           `json:"page_len,omitempty"`
}

type SourceArchive struct {
	Filename      string `json:"filename,omitempty"`
	MIMEType      string `json:"mime_type,omitempty"`
	ArchiveFormat string `json:"archive_format,omitempty"`
	RootPrefix    string `json:"root_prefix,omitempty"`
	Data          []byte `json:"-"`
	LocalPath     string `json:"-"`
}

type Comment struct {
	ID          string     `json:"id"`
	Body        string     `json:"body"`
	AuthorEmail string     `json:"author_email"`
	AuthorName  string     `json:"author_name"`
	CreatedAt   int64      `json:"created_at"`
	UpdatedAt   int64      `json:"updated_at"`
	PRID        string     `json:"pr_id"`
	Inline      bool       `json:"inline"`
	FilePath    string     `json:"file_path,omitempty"`
	Line        int        `json:"line,omitempty"`
	Repo        Repository `json:"repo"`
}

type CreatePRRequest struct {
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	SourceBranch string   `json:"source_branch"`
	TargetBranch string   `json:"target_branch"`
	Reviewers    []string `json:"reviewers,omitempty"`
}

type MergeStrategy string

const (
	MergeStrategyMerge  MergeStrategy = "merge"
	MergeStrategySquash MergeStrategy = "squash"
	MergeStrategyRebase MergeStrategy = "rebase"
)
