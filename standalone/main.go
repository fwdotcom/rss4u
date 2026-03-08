package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os/exec"
	"runtime"
)

//go:embed all:public/**
var embeddedPublic embed.FS

func main() {
	port := flag.Int("port", 8080, "Port for the web server")
	open := flag.Bool("open", true, "Open default browser on startup")
	flag.Parse()

	publicFS, err := fs.Sub(embeddedPublic, "public")
	if err != nil {
		log.Fatalf("failed to open embedded public assets: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(publicFS)))

	addr := fmt.Sprintf(":%d", *port)
	url := fmt.Sprintf("http://localhost:%d", *port)

	if *open {
		go func() {
			if err := openBrowser(url); err != nil {
				log.Printf("could not open browser automatically: %v", err)
			}
		}()
	}

	log.Printf("Serving embedded public assets at %s", url)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		return exec.Command("open", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}
