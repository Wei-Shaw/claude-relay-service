// claude-cookie-helper performs the two Cloudflare-protected claude.ai calls of
// the Cookie auto-authorization flow (organization lookup + authorize) using a
// real Chrome TLS/HTTP2 fingerprint, which plain Node/axios cannot produce.
//
// claude.ai sits behind Cloudflare bot management, which fingerprints the TLS
// ClientHello (JA3) and HTTP/2 settings. A Node/axios request is flagged
// (cf-mitigated: challenge -> HTTP 403) before the origin sees the sessionKey,
// so the relay misreported it as "invalid sessionKey". This helper impersonates
// Chrome (github.com/imroc/req/v3) and passes the challenge.
//
// Protocol: read one JSON object from stdin, write one JSON object to stdout.
//   in:  {"sessionKey":"...","scope":"...","proxyUrl":"http://..."}  (proxyUrl optional)
//   out (ok):   {"organizationUuid":"...","capabilities":[...],"authorizationCode":"code#state","codeVerifier":"...","state":"..."}
//   out (fail): {"error":"...","status":403,"cloudflare":true}  (exit code 1)
//
// The token exchange (step 3, platform.claude.com) stays in the Node relay, which
// already works with axios and keeps the existing token/subscription parsing.
package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/imroc/req/v3"
)

const (
	clientID    = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
	redirectURI = "https://platform.claude.com/oauth/code/callback"
	baseURL     = "https://claude.ai"
)

type input struct {
	SessionKey string `json:"sessionKey"`
	Scope      string `json:"scope"`
	ProxyURL   string `json:"proxyUrl"`
}

type output struct {
	OrganizationUUID  string   `json:"organizationUuid"`
	Capabilities      []string `json:"capabilities"`
	AuthorizationCode string   `json:"authorizationCode"`
	CodeVerifier      string   `json:"codeVerifier"`
	State             string   `json:"state"`
}

type errOut struct {
	Error      string `json:"error"`
	Status     int    `json:"status,omitempty"`
	Cloudflare bool   `json:"cloudflare,omitempty"`
}

func fail(msg string, status int, cf bool) {
	b, _ := json.Marshal(errOut{Error: msg, Status: status, Cloudflare: cf})
	fmt.Println(string(b))
	os.Exit(1)
}

func b64url(b []byte) string { return strings.TrimRight(base64.URLEncoding.EncodeToString(b), "=") }
func randBytes(n int) []byte { b := make([]byte, n); _, _ = rand.Read(b); return b }

func isCloudflare(resp *req.Response) bool {
	if resp.GetHeader("cf-mitigated") != "" {
		return true
	}
	ct := resp.GetHeader("Content-Type")
	if strings.Contains(ct, "text/html") && resp.GetHeader("cf-ray") != "" {
		return true
	}
	return false
}

func main() {
	raw, err := io.ReadAll(os.Stdin)
	if err != nil {
		fail("failed to read stdin: "+err.Error(), 0, false)
	}
	var in input
	if err := json.Unmarshal(raw, &in); err != nil {
		fail("invalid input JSON: "+err.Error(), 0, false)
	}
	if in.SessionKey == "" {
		fail("sessionKey is required", 0, false)
	}
	if in.Scope == "" {
		in.Scope = "user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload"
	}

	client := req.C().ImpersonateChrome().SetCookieJar(nil)
	if in.ProxyURL != "" {
		client.SetProxyURL(in.ProxyURL)
	}
	cookie := &http.Cookie{Name: "sessionKey", Value: in.SessionKey}

	// Step 1: organization lookup
	var orgs []struct {
		UUID         string   `json:"uuid"`
		Name         string   `json:"name"`
		RavenType    *string  `json:"raven_type"`
		Capabilities []string `json:"capabilities"`
	}
	r1, err := client.R().SetCookies(cookie).SetSuccessResult(&orgs).Get(baseURL + "/api/organizations")
	if err != nil {
		fail("organization request failed: "+err.Error(), 0, false)
	}
	if !r1.IsSuccessState() {
		fail(fmt.Sprintf("failed to get organizations: HTTP %d", r1.StatusCode), r1.StatusCode, isCloudflare(r1))
	}
	if len(orgs) == 0 {
		fail("no organizations found for this sessionKey", r1.StatusCode, false)
	}
	// Select: prefer a "team" org, else the first (matches sub2api; no strict chat-capability filter).
	sel := 0
	for i, o := range orgs {
		if o.RavenType != nil && *o.RavenType == "team" {
			sel = i
			break
		}
	}
	orgUUID := orgs[sel].UUID
	caps := orgs[sel].Capabilities
	if caps == nil {
		caps = []string{}
	}

	// Step 2: authorize (PKCE)
	cv := b64url(randBytes(32))
	sum := sha256.Sum256([]byte(cv))
	cc := b64url(sum[:])
	state := b64url(randBytes(32))
	authURL := fmt.Sprintf("%s/v1/oauth/%s/authorize", baseURL, orgUUID)
	body := map[string]any{
		"response_type": "code", "client_id": clientID, "organization_uuid": orgUUID,
		"redirect_uri": redirectURI, "scope": in.Scope, "state": state,
		"code_challenge": cc, "code_challenge_method": "S256",
	}
	var res struct {
		RedirectURI string `json:"redirect_uri"`
	}
	r2, err := client.R().
		SetCookies(cookie).
		SetHeader("Content-Type", "application/json").
		SetHeader("Referer", "https://claude.ai/new").
		SetBody(body).
		SetSuccessResult(&res).
		Post(authURL)
	if err != nil {
		fail("authorize request failed: "+err.Error(), 0, false)
	}
	if !r2.IsSuccessState() {
		fail(fmt.Sprintf("authorization failed: HTTP %d", r2.StatusCode), r2.StatusCode, isCloudflare(r2))
	}
	if res.RedirectURI == "" {
		fail("no redirect_uri in authorize response", r2.StatusCode, false)
	}
	u, err := url.Parse(res.RedirectURI)
	if err != nil {
		fail("failed to parse redirect_uri: "+err.Error(), 0, false)
	}
	code := u.Query().Get("code")
	rstate := u.Query().Get("state")
	if code == "" {
		fail("no authorization code in redirect_uri", 0, false)
	}
	fullCode := code
	if rstate != "" {
		fullCode = code + "#" + rstate
	}

	out, _ := json.Marshal(output{
		OrganizationUUID:  orgUUID,
		Capabilities:      caps,
		AuthorizationCode: fullCode,
		CodeVerifier:      cv,
		State:             state,
	})
	fmt.Println(string(out))
}
