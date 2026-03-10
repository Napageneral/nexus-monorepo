package atlassian

import "time"

type Space struct {
	ID   string `json:"id"`
	Key  string `json:"key"`
	Name string `json:"name"`
}

type Page struct {
	ID        string      `json:"id"`
	Status    string      `json:"status,omitempty"`
	Title     string      `json:"title"`
	SpaceID   string      `json:"spaceId,omitempty"`
	ParentID  string      `json:"parentId,omitempty"`
	Version   PageVersion `json:"version"`
	Body      PageBody    `json:"body"`
	Labels    []Label     `json:"labels,omitempty"`
	Ancestors []Ancestor  `json:"ancestors,omitempty"`
}

func (p Page) EffectiveParentID() string {
	if p.ParentID != "" {
		return p.ParentID
	}
	if len(p.Ancestors) == 0 {
		return ""
	}
	return p.Ancestors[len(p.Ancestors)-1].ID
}

type Ancestor struct {
	ID string `json:"id"`
}

type PageVersion struct {
	Number    int       `json:"number"`
	AuthorID  string    `json:"authorId,omitempty"`
	CreatedAt time.Time `json:"createdAt,omitempty"`
	Message   string    `json:"message,omitempty"`
	Page      *Page     `json:"page,omitempty"`
}

type PageBody struct {
	Storage StorageBody `json:"storage"`
}

type StorageBody struct {
	Value          string `json:"value"`
	Representation string `json:"representation"`
}

type Label struct {
	ID   string `json:"id,omitempty"`
	Name string `json:"name"`
}

type User struct {
	AccountID   string `json:"accountId"`
	DisplayName string `json:"displayName"`
}

type Comment struct {
	ID      string         `json:"id"`
	PageID  string         `json:"pageId,omitempty"`
	Body    CommentBody    `json:"body"`
	Version CommentVersion `json:"version,omitempty"`
}

type CommentBody struct {
	Storage StorageBody `json:"storage"`
}

type CommentVersion struct {
	Number int `json:"number"`
}

type CreatePageRequest struct {
	SpaceID  string
	Title    string
	ParentID string
	BodyHTML string
}

type UpdatePageRequest struct {
	Title          string
	VersionNumber  int
	VersionMessage string
	BodyHTML       string
}

type listSpacesResponse struct {
	Results []Space `json:"results"`
	Links   struct {
		Next string `json:"next"`
	} `json:"_links"`
}

type pagesResponse struct {
	Results []Page `json:"results"`
	Links   struct {
		Next string `json:"next"`
	} `json:"_links"`
}

type labelsResponse struct {
	Results []Label `json:"results"`
	Links   struct {
		Next string `json:"next"`
	} `json:"_links"`
}

type versionsResponse struct {
	Results []PageVersion `json:"results"`
	Links   struct {
		Next string `json:"next"`
	} `json:"_links"`
}

type cqlSearchResult struct {
	Results []cqlPage `json:"results"`
	Start   int       `json:"start"`
	Limit   int       `json:"limit"`
	Size    int       `json:"size"`
	Total   int       `json:"totalSize"`
}

type cqlPage struct {
	ID     string `json:"id"`
	Status string `json:"status,omitempty"`
	Title  string `json:"title"`
	Space  struct {
		Key  string `json:"key"`
		Name string `json:"name"`
		ID   string `json:"id"`
	} `json:"space"`
	Version struct {
		Number    int       `json:"number"`
		AuthorID  string    `json:"authorId"`
		CreatedAt time.Time `json:"when"`
		By        struct {
			AccountID string `json:"accountId"`
		} `json:"by"`
	} `json:"version"`
	Ancestors []Ancestor `json:"ancestors,omitempty"`
	Body      struct {
		Storage StorageBody `json:"storage"`
	} `json:"body"`
	Metadata struct {
		Labels struct {
			Results []Label `json:"results"`
		} `json:"labels"`
	} `json:"metadata"`
}

func (p cqlPage) ToPage() Page {
	authorID := p.Version.AuthorID
	if authorID == "" {
		authorID = p.Version.By.AccountID
	}
	return Page{
		ID:        p.ID,
		Status:    p.Status,
		Title:     p.Title,
		SpaceID:   p.Space.ID,
		Ancestors: p.Ancestors,
		Version: PageVersion{
			Number:    p.Version.Number,
			AuthorID:  authorID,
			CreatedAt: p.Version.CreatedAt,
		},
		Body: PageBody{
			Storage: p.Body.Storage,
		},
		Labels: p.Metadata.Labels.Results,
	}
}

type bulkUsersResponse struct {
	Results []User `json:"results"`
}
