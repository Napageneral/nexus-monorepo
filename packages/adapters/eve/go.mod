module github.com/nexus-project/adapter-eve

go 1.23

require (
	github.com/mattn/go-sqlite3 v1.14.33
	github.com/nexus-project/adapter-sdk-go v0.0.0
)

require github.com/gorilla/websocket v1.5.3 // indirect

replace github.com/nexus-project/adapter-sdk-go => ../nexus-adapter-sdks/nexus-adapter-sdk-go
