package frontdoorsdk

import (
  "context"
  "net/http"

  generated "github.com/Napageneral/nexus-monorepo/artifacts/sdk/go/platform/frontdoor-sdk-go/internal/generated"
)

type Option func(*clientOptions)

type clientOptions struct {
  headers map[string]string
  httpClient *http.Client
}

func WithHeader(key string, value string) Option {
  return func(options *clientOptions) {
    if options.headers == nil {
      options.headers = map[string]string{}
    }
    options.headers[key] = value
  }
}

func WithHTTPClient(client *http.Client) Option {
  return func(options *clientOptions) {
    options.httpClient = client
  }
}

type Client struct {
  raw *generated.APIClient
  Apps *AppsClient
  Auth *AuthClient
  Runtime *RuntimeClient
  Servers *ServersClient
}

type AppsClient struct {
  raw *generated.APIClient
}

type AuthClient struct {
  raw *generated.APIClient
}

type RuntimeClient struct {
  raw *generated.APIClient
  Token *RuntimeTokenClient
}

type RuntimeTokenClient struct {
  raw *generated.APIClient
}

type ServersClient struct {
  raw *generated.APIClient
  Adapters *ServersAdaptersClient
  Apps *ServersAppsClient
}

type ServersAdaptersClient struct {
  raw *generated.APIClient
}

type ServersAppsClient struct {
  raw *generated.APIClient
}

type FrontdoorAppsCatalogResponse = generated.FrontdoorAppsCatalog200Response
type FrontdoorAuthLoginResponse = generated.FrontdoorAuthLogin200Response
type FrontdoorAuthMeResponse = generated.FrontdoorAuthMe200Response
type FrontdoorRuntimeTokenIssueResponse = generated.FrontdoorRuntimeTokenIssue200Response
type FrontdoorRuntimeTokenRefreshResponse = generated.FrontdoorRuntimeTokenIssue200Response
type FrontdoorRuntimeTokenRevokeResponse = generated.FrontdoorRuntimeTokenRevoke200Response
type FrontdoorServersAdaptersInstallResponse = generated.FrontdoorServersAdaptersInstall200Response
type FrontdoorServersAdaptersInstallStatusResponse = generated.FrontdoorServersAdaptersInstallStatus200Response
type FrontdoorServersAdaptersUninstallResponse = generated.FrontdoorServersAdaptersUninstall200Response
type FrontdoorServersAdaptersUpgradeResponse = generated.FrontdoorServersAdaptersUpgrade200Response
type FrontdoorServersAppsInstallResponse = generated.FrontdoorServersAppsInstall200Response
type FrontdoorServersAppsInstallStatusResponse = generated.FrontdoorServersAppsInstallStatus200Response
type FrontdoorServersAppsUninstallResponse = generated.FrontdoorServersAdaptersUninstall200Response
type FrontdoorServersAppsUpgradeResponse = generated.FrontdoorServersAdaptersUpgrade200Response
type FrontdoorServersGetResponse = generated.FrontdoorServersGet200Response

type FrontdoorAuthLoginRequest = generated.FrontdoorAuthLoginRequest

type FrontdoorRuntimeTokenIssueRequest = generated.FrontdoorRuntimeTokenIssueRequest

type FrontdoorRuntimeTokenRefreshRequest = generated.FrontdoorRuntimeTokenRefreshRequest

type FrontdoorRuntimeTokenRevokeRequest = generated.FrontdoorRuntimeTokenRevokeRequest

type FrontdoorServersAdaptersInstallRequest struct {
  ServerId string
  AdapterId string
  FrontdoorServersAdaptersInstallRequest generated.FrontdoorServersAdaptersInstallRequest
}

type FrontdoorServersAdaptersInstallStatusRequest struct {
  ServerId string
  AdapterId string
}

type FrontdoorServersAdaptersUninstallRequest struct {
  ServerId string
  AdapterId string
}

type FrontdoorServersAdaptersUpgradeRequest struct {
  ServerId string
  AdapterId string
  FrontdoorServersAdaptersUpgradeRequest generated.FrontdoorServersAdaptersUpgradeRequest
}

type FrontdoorServersAppsInstallRequest struct {
  ServerId string
  AppId string
}

type FrontdoorServersAppsInstallStatusRequest struct {
  ServerId string
  AppId string
}

type FrontdoorServersAppsUninstallRequest struct {
  ServerId string
  AppId string
}

type FrontdoorServersAppsUpgradeRequest struct {
  ServerId string
  AppId string
  FrontdoorServersAppsUpgradeRequest generated.FrontdoorServersAdaptersUpgradeRequest
}

type FrontdoorServersGetRequest struct {
  ServerId string
}

func NewClient(baseURL string, opts ...Option) *Client {
  cfg := generated.NewConfiguration()
  cfg.Servers = generated.ServerConfigurations{{URL: baseURL}}
  options := &clientOptions{}
  for _, opt := range opts {
    opt(options)
  }
  if options.httpClient != nil {
    cfg.HTTPClient = options.httpClient
  }
  if len(options.headers) > 0 {
    cfg.DefaultHeader = options.headers
  }
  raw := generated.NewAPIClient(cfg)
  client := &Client{raw: raw}
  client.Apps = newAppsClient(raw)
  client.Auth = newAuthClient(raw)
  client.Runtime = newRuntimeClient(raw)
  client.Servers = newServersClient(raw)
  return client
}

func newAppsClient(raw *generated.APIClient) *AppsClient {
  client := &AppsClient{raw: raw}
  return client
}

func newAuthClient(raw *generated.APIClient) *AuthClient {
  client := &AuthClient{raw: raw}
  return client
}

func newRuntimeClient(raw *generated.APIClient) *RuntimeClient {
  client := &RuntimeClient{raw: raw}
  client.Token = newRuntimeTokenClient(raw)
  return client
}

func newRuntimeTokenClient(raw *generated.APIClient) *RuntimeTokenClient {
  client := &RuntimeTokenClient{raw: raw}
  return client
}

func newServersClient(raw *generated.APIClient) *ServersClient {
  client := &ServersClient{raw: raw}
  client.Adapters = newServersAdaptersClient(raw)
  client.Apps = newServersAppsClient(raw)
  return client
}

func newServersAdaptersClient(raw *generated.APIClient) *ServersAdaptersClient {
  client := &ServersAdaptersClient{raw: raw}
  return client
}

func newServersAppsClient(raw *generated.APIClient) *ServersAppsClient {
  client := &ServersAppsClient{raw: raw}
  return client
}

func (a *AppsClient) Catalog(ctx context.Context) (*FrontdoorAppsCatalogResponse, error) {
  response, _, err := a.raw.AppsAPI.FrontdoorAppsCatalog(ctx).Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AuthClient) Login(ctx context.Context, request FrontdoorAuthLoginRequest) (*FrontdoorAuthLoginResponse, error) {
  builder := a.raw.AuthAPI.FrontdoorAuthLogin(ctx)
  builder = builder.FrontdoorAuthLoginRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AuthClient) Me(ctx context.Context) (*FrontdoorAuthMeResponse, error) {
  response, _, err := a.raw.AuthAPI.FrontdoorAuthMe(ctx).Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (r *RuntimeTokenClient) Issue(ctx context.Context, request FrontdoorRuntimeTokenIssueRequest) (*FrontdoorRuntimeTokenIssueResponse, error) {
  builder := r.raw.RuntimeAPI.FrontdoorRuntimeTokenIssue(ctx)
  builder = builder.FrontdoorRuntimeTokenIssueRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (r *RuntimeTokenClient) Refresh(ctx context.Context, request FrontdoorRuntimeTokenRefreshRequest) (*FrontdoorRuntimeTokenRefreshResponse, error) {
  builder := r.raw.RuntimeAPI.FrontdoorRuntimeTokenRefresh(ctx)
  builder = builder.FrontdoorRuntimeTokenRefreshRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (r *RuntimeTokenClient) Revoke(ctx context.Context, request FrontdoorRuntimeTokenRevokeRequest) (*FrontdoorRuntimeTokenRevokeResponse, error) {
  builder := r.raw.RuntimeAPI.FrontdoorRuntimeTokenRevoke(ctx)
  builder = builder.FrontdoorRuntimeTokenRevokeRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *ServersClient) Get(ctx context.Context, request FrontdoorServersGetRequest) (*FrontdoorServersGetResponse, error) {
  builder := s.raw.ServersAPI.FrontdoorServersGet(ctx, request.ServerId)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *ServersAdaptersClient) Install(ctx context.Context, request FrontdoorServersAdaptersInstallRequest) (*FrontdoorServersAdaptersInstallResponse, error) {
  builder := s.raw.ServersAPI.FrontdoorServersAdaptersInstall(ctx, request.ServerId, request.AdapterId)
  builder = builder.FrontdoorServersAdaptersInstallRequest(request.FrontdoorServersAdaptersInstallRequest)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *ServersAdaptersClient) InstallStatus(ctx context.Context, request FrontdoorServersAdaptersInstallStatusRequest) (*FrontdoorServersAdaptersInstallStatusResponse, error) {
  builder := s.raw.ServersAPI.FrontdoorServersAdaptersInstallStatus(ctx, request.ServerId, request.AdapterId)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *ServersAdaptersClient) Uninstall(ctx context.Context, request FrontdoorServersAdaptersUninstallRequest) (*FrontdoorServersAdaptersUninstallResponse, error) {
  builder := s.raw.ServersAPI.FrontdoorServersAdaptersUninstall(ctx, request.ServerId, request.AdapterId)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *ServersAdaptersClient) Upgrade(ctx context.Context, request FrontdoorServersAdaptersUpgradeRequest) (*FrontdoorServersAdaptersUpgradeResponse, error) {
  builder := s.raw.ServersAPI.FrontdoorServersAdaptersUpgrade(ctx, request.ServerId, request.AdapterId)
  builder = builder.FrontdoorServersAdaptersUpgradeRequest(request.FrontdoorServersAdaptersUpgradeRequest)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *ServersAppsClient) Install(ctx context.Context, request FrontdoorServersAppsInstallRequest) (*FrontdoorServersAppsInstallResponse, error) {
  builder := s.raw.ServersAPI.FrontdoorServersAppsInstall(ctx, request.ServerId, request.AppId)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *ServersAppsClient) InstallStatus(ctx context.Context, request FrontdoorServersAppsInstallStatusRequest) (*FrontdoorServersAppsInstallStatusResponse, error) {
  builder := s.raw.ServersAPI.FrontdoorServersAppsInstallStatus(ctx, request.ServerId, request.AppId)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *ServersAppsClient) Uninstall(ctx context.Context, request FrontdoorServersAppsUninstallRequest) (*FrontdoorServersAppsUninstallResponse, error) {
  builder := s.raw.ServersAPI.FrontdoorServersAppsUninstall(ctx, request.ServerId, request.AppId)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *ServersAppsClient) Upgrade(ctx context.Context, request FrontdoorServersAppsUpgradeRequest) (*FrontdoorServersAppsUpgradeResponse, error) {
  builder := s.raw.ServersAPI.FrontdoorServersAppsUpgrade(ctx, request.ServerId, request.AppId)
  builder = builder.FrontdoorServersAdaptersUpgradeRequest(request.FrontdoorServersAppsUpgradeRequest)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}
