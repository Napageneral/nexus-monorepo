package nexadapter

import (
	"context"
	"strings"
	"time"
)

type AdapterRuntimeContext struct {
	Context      context.Context
	Runtime      *RuntimeContext
	ConnectionID string
}

type AdapterContext[T any] struct {
	Context      context.Context
	Runtime      *RuntimeContext
	ConnectionID string
	Client       T
}

type ClientFactory[T any] struct {
	Create func(ctx AdapterRuntimeContext) (T, error)
}

type ConnectionHandlers[T any] struct {
	Connections func(ctx AdapterContext[T]) ([]AdapterConnectionIdentity, error)
	Health      func(ctx AdapterContext[T]) (*AdapterHealth, error)
}

type IngestHandlers[T any] struct {
	Monitor  func(ctx AdapterContext[T], emit EmitFunc) error
	Backfill func(ctx AdapterContext[T], since time.Time, emit EmitFunc) error
}

type SetupHandlers[T any] struct {
	Start  func(ctx AdapterContext[T], req AdapterSetupRequest) (*AdapterSetupResult, error)
	Submit func(ctx AdapterContext[T], req AdapterSetupRequest) (*AdapterSetupResult, error)
	Status func(ctx AdapterContext[T], req AdapterSetupRequest) (*AdapterSetupResult, error)
	Cancel func(ctx AdapterContext[T], req AdapterSetupRequest) (*AdapterSetupResult, error)
}

type DeclaredMethod[T any] struct {
	Description        string
	Action             string
	Params             map[string]any
	Response           map[string]any
	ConnectionRequired *bool
	MutatesRemote      *bool
	ContextHints       AdapterMethodContextHints
	Origin             *AdapterMethodOrigin
	Handler            func(ctx AdapterContext[T], req AdapterMethodRequest) (any, error)
}

type DefineAdapterConfig[T any] struct {
	Platform          string
	Name              string
	Version           string
	MultiAccount      bool
	CredentialService string
	Auth              *AdapterAuthManifest
	Capabilities      ChannelCapabilities
	MethodCatalog     *AdapterMethodCatalog
	Client            ClientFactory[T]
	Connection        ConnectionHandlers[T]
	Ingest            IngestHandlers[T]
	Setup             SetupHandlers[T]
	ServeStart        func(ctx context.Context, connectionID string, session *ServeSession) error
	Methods           map[string]DeclaredMethod[T]
}

func Method[T any](declaration DeclaredMethod[T]) DeclaredMethod[T] {
	return declaration
}

func DefineAdapter[T any](config DefineAdapterConfig[T]) Adapter {
	methods := config.Methods
	if methods == nil {
		methods = map[string]DeclaredMethod[T]{}
	}

	return Adapter{
		Operations: AdapterOperations{
			AdapterInfo: func(ctx context.Context) (*AdapterInfo, error) {
				info := buildAdapterInfo(config, methods)
				return &info, nil
			},
			AdapterConnectionsList: func(ctx context.Context) ([]AdapterConnectionIdentity, error) {
				adapterCtx, err := createAdapterContext(ctx, "", config.Client)
				if err != nil {
					return nil, err
				}
				if config.Connection.Connections != nil {
					return config.Connection.Connections(adapterCtx)
				}
				return defaultConnections(adapterCtx), nil
			},
			AdapterHealth: func(ctx context.Context, connectionID string) (*AdapterHealth, error) {
				adapterCtx, err := createAdapterContext(ctx, connectionID, config.Client)
				if err != nil {
					return nil, err
				}
				if config.Connection.Health != nil {
					health, err := config.Connection.Health(adapterCtx)
					if err != nil {
						return nil, err
					}
					if health != nil && strings.TrimSpace(health.ConnectionID) == "" {
						health.ConnectionID = adapterCtx.ConnectionID
					}
					return health, nil
				}
				return &AdapterHealth{
					Connected:    true,
					ConnectionID: adapterCtx.ConnectionID,
				}, nil
			},
			MonitorStart: func(ctx context.Context, connectionID string, emit EmitFunc) error {
				if config.Ingest.Monitor == nil {
					return nil
				}
				adapterCtx, err := createAdapterContext(ctx, connectionID, config.Client)
				if err != nil {
					return err
				}
				return config.Ingest.Monitor(adapterCtx, emit)
			},
			RecordsBackfill: func(ctx context.Context, connectionID string, since time.Time, emit EmitFunc) error {
				if config.Ingest.Backfill == nil {
					return nil
				}
				adapterCtx, err := createAdapterContext(ctx, connectionID, config.Client)
				if err != nil {
					return err
				}
				return config.Ingest.Backfill(adapterCtx, since, emit)
			},
			AdapterSetupStart: func(ctx context.Context, req AdapterSetupRequest) (*AdapterSetupResult, error) {
				if config.Setup.Start == nil {
					return nil, nil
				}
				adapterCtx, err := createAdapterContext(ctx, req.ConnectionID, config.Client)
				if err != nil {
					return nil, err
				}
				return config.Setup.Start(adapterCtx, req)
			},
			AdapterSetupSubmit: func(ctx context.Context, req AdapterSetupRequest) (*AdapterSetupResult, error) {
				if config.Setup.Submit == nil {
					return nil, nil
				}
				adapterCtx, err := createAdapterContext(ctx, req.ConnectionID, config.Client)
				if err != nil {
					return nil, err
				}
				return config.Setup.Submit(adapterCtx, req)
			},
			AdapterSetupStatus: func(ctx context.Context, req AdapterSetupRequest) (*AdapterSetupResult, error) {
				if config.Setup.Status == nil {
					return nil, nil
				}
				adapterCtx, err := createAdapterContext(ctx, req.ConnectionID, config.Client)
				if err != nil {
					return nil, err
				}
				return config.Setup.Status(adapterCtx, req)
			},
			AdapterSetupCancel: func(ctx context.Context, req AdapterSetupRequest) (*AdapterSetupResult, error) {
				if config.Setup.Cancel == nil {
					return nil, nil
				}
				adapterCtx, err := createAdapterContext(ctx, req.ConnectionID, config.Client)
				if err != nil {
					return nil, err
				}
				return config.Setup.Cancel(adapterCtx, req)
			},
			ServeStart:     config.ServeStart,
			Methods:        buildMethodHandlers(config, methods),
		},
	}
}

func createAdapterContext[T any](ctx context.Context, connectionID string, factory ClientFactory[T]) (AdapterContext[T], error) {
	runtimeCtx, err := loadRuntimeContextOptional()
	if err != nil {
		return AdapterContext[T]{}, err
	}

	resolvedConnectionID := strings.TrimSpace(connectionID)
	if resolvedConnectionID == "" && runtimeCtx != nil {
		resolvedConnectionID = strings.TrimSpace(runtimeCtx.ConnectionID)
	}

	adapterCtx := AdapterContext[T]{
		Context:      ctx,
		Runtime:      runtimeCtx,
		ConnectionID: resolvedConnectionID,
	}

	if factory.Create != nil {
		client, err := factory.Create(AdapterRuntimeContext{
			Context:      ctx,
			Runtime:      runtimeCtx,
			ConnectionID: resolvedConnectionID,
		})
		if err != nil {
			return AdapterContext[T]{}, err
		}
		adapterCtx.Client = client
	}

	return adapterCtx, nil
}

func loadRuntimeContextOptional() (*RuntimeContext, error) {
	runtimeCtx, err := LoadRuntimeContextFromEnv()
	if err == nil {
		return runtimeCtx, nil
	}
	if strings.Contains(err.Error(), "missing runtime context") {
		return nil, nil
	}
	return nil, err
}

func defaultConnections[T any](ctx AdapterContext[T]) []AdapterConnectionIdentity {
	connectionID := strings.TrimSpace(ctx.ConnectionID)
	if connectionID == "" && ctx.Runtime != nil {
		connectionID = strings.TrimSpace(ctx.Runtime.ConnectionID)
	}
	if connectionID == "" {
		return []AdapterConnectionIdentity{}
	}

	connection := AdapterConnectionIdentity{
		ID:     connectionID,
		Status: "ready",
	}
	if ctx.Runtime != nil && ctx.Runtime.Credential != nil {
		if ref := strings.TrimSpace(ctx.Runtime.Credential.Ref); ref != "" {
			connection.CredentialRef = ref
		}
	}
	return []AdapterConnectionIdentity{connection}
}

func buildMethodHandlers[T any](config DefineAdapterConfig[T], methods map[string]DeclaredMethod[T]) map[string]func(ctx context.Context, req AdapterMethodRequest) (any, error) {
	if len(methods) == 0 {
		return nil
	}
	built := make(map[string]func(ctx context.Context, req AdapterMethodRequest) (any, error), len(methods))
	for name, declaration := range methods {
		decl := declaration
		built[name] = func(ctx context.Context, req AdapterMethodRequest) (any, error) {
			adapterCtx, err := createAdapterContext(ctx, req.ConnectionID, config.Client)
			if err != nil {
				return nil, err
			}
			return decl.Handler(adapterCtx, req)
		}
	}
	return built
}

func buildAdapterInfo[T any](config DefineAdapterConfig[T], methods map[string]DeclaredMethod[T]) AdapterInfo {
	operations := []AdapterOperation{
		OpAdapterInfo,
		OpAdapterConnectionsList,
		OpAdapterHealth,
	}
	if config.Ingest.Monitor != nil {
		operations = append(operations, OpAdapterMonitorStart)
	}
	if config.Ingest.Backfill != nil {
		operations = append(operations, OpRecordsBackfill)
	}
	if config.Setup.Start != nil {
		operations = append(operations, OpAdapterSetupStart)
	}
	if config.Setup.Submit != nil {
		operations = append(operations, OpAdapterSetupSubmit)
	}
	if config.Setup.Status != nil {
		operations = append(operations, OpAdapterSetupStatus)
	}
	if config.Setup.Cancel != nil {
		operations = append(operations, OpAdapterSetupCancel)
	}
	if config.ServeStart != nil {
		operations = append(operations, OpAdapterServeStart)
	}

	methodDescriptors := make([]AdapterMethod, 0, len(methods))
	for name, declaration := range methods {
		methodDescriptors = append(methodDescriptors, buildMethodDescriptor(config, name, declaration))
	}

	info := AdapterInfo{
		Platform:             config.Platform,
		Name:                 config.Name,
		Version:              config.Version,
		Operations:           operations,
		Methods:              methodDescriptors,
		CredentialService:    config.CredentialService,
		MultiAccount:         config.MultiAccount,
		PlatformCapabilities: config.Capabilities,
		Auth:                 config.Auth,
	}
	if len(methodDescriptors) > 0 {
		if config.MethodCatalog != nil {
			info.MethodCatalog = config.MethodCatalog
		} else {
			info.MethodCatalog = &AdapterMethodCatalog{
				Source:    "manifest",
				Namespace: config.Platform,
			}
		}
	} else if config.MethodCatalog != nil {
		info.MethodCatalog = config.MethodCatalog
	}
	return info
}

func buildMethodDescriptor[T any](config DefineAdapterConfig[T], name string, declaration DeclaredMethod[T]) AdapterMethod {
	action := strings.TrimSpace(declaration.Action)
	if action == "" {
		if declaration.MutatesRemote != nil && *declaration.MutatesRemote {
			action = "write"
		} else {
			action = "read"
		}
	}
	connectionRequired := true
	if declaration.ConnectionRequired != nil {
		connectionRequired = *declaration.ConnectionRequired
	}
	mutatesRemote := action == "write"
	if declaration.MutatesRemote != nil {
		mutatesRemote = *declaration.MutatesRemote
	} else if action == "write" {
		mutatesRemote = true
	}
	origin := declaration.Origin
	if origin == nil {
		origin = &AdapterMethodOrigin{
			PackageID:         config.Platform,
			PackageVersion:    config.Version,
			DeclarationMode:   "builtin",
			DeclarationSource: "sdk.define",
			Namespace:         config.Platform,
		}
	}

	contextHints := declaration.ContextHints
	if contextHints.Params == nil {
		contextHints.Params = map[string]AdapterMethodContextHintValue{}
	}

	return AdapterMethod{
		Name:               name,
		Description:        declaration.Description,
		Action:             action,
		Params:             declaration.Params,
		Response:           declaration.Response,
		ConnectionRequired: connectionRequired,
		MutatesRemote:      mutatesRemote,
		Origin:             *origin,
		ContextHints:       contextHints,
	}
}
