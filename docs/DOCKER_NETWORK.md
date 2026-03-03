# Docker build: TLS / network issues

If you see:

```text
failed to solve: node:20-bookworm-slim: failed to do request: Head "https://registry-1.docker.io/...": net/http: TLS handshake timeout
```

Docker cannot reach Docker Hub. Try:

1. **Retry**  
   Timeouts are often transient:
   ```bash
   docker compose up --build
   ```

2. **Check network**  
   - Restart Docker Desktop.  
   - Ensure no VPN/proxy is blocking `registry-1.docker.io`.  
   - Test: `curl -I https://registry-1.docker.io/v2/`

3. **Docker Hub login (if required)**  
   ```bash
   docker login
   ```

4. **Pull base images first**  
   Sometimes pulling in isolation works when build fails:
   ```bash
   docker pull node:20-alpine
   docker pull node:20-bookworm-slim
   docker compose up --build
   ```

5. **Use a Docker Hub mirror**  
   If you have a mirror (e.g. company or regional), set it in Docker Desktop:  
   **Settings → Docker Engine** and add `"registry-mirrors": ["https://your-mirror"]`.
