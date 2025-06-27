# Security Audit Report - n8n-autoscaling

## Executive Summary

This security audit of the n8n-autoscaling repository identified several security concerns ranging from critical to low severity. The most significant issues involve exposed secrets, insecure Docker configurations, and potential command injection vulnerabilities.

## Critical Findings

### 1. Docker Socket Exposure (CRITICAL)
**Location:** docker-compose.yml:82, 238
```yaml
- /var/run/docker.sock:/var/run/docker.sock:ro  # traefik
- /var/run/docker.sock:/var/run/docker.sock     # autoscaler
```
**Risk:** Container escape, privilege escalation, host system compromise
**Impact:** An attacker gaining access to these containers could control the Docker daemon and compromise the entire host system.

### 2. Weak Default Credentials (HIGH)
**Location:** .env.example
- Default PostgreSQL password placeholder: "YOURPASSWORD"
- Generic encryption key placeholder: "YOURKEY"
- Weak JWT secret placeholder: "YOURKEY"
**Risk:** If users don't change these defaults, systems are vulnerable to unauthorized access.

### 3. Running as Root (HIGH)
**Location:** docker-compose.yml:18
```yaml
user: root:root
```
**Risk:** Container compromise leads to root access within container, increasing attack surface.

## High Severity Issues

### 4. PostgreSQL Authentication Method (HIGH)
**Location:** docker-compose.yml:108-109
```yaml
POSTGRES_HOST_AUTH_METHOD=scram-sha-256
```
**Risk:** While SCRAM-SHA-256 is secure, exposing PostgreSQL on all interfaces (port 5432) increases attack surface.

### 5. Command Injection Potential (HIGH)
**Location:** autoscaler/autoscaler.py:110-121
```python
command = [
    "docker", "compose", "-f", compose_file,
    "--project-name", project_name,
    "--project-directory", "/app",
    "up", "-d", "--no-deps",
    "--scale", f"{service_name}={replicas}",
    service_name
]
```
**Risk:** If environment variables are not properly sanitized, command injection is possible.

### 6. External Network Exposure (HIGH)
**Location:** docker-compose.yml:11-12
```yaml
shark:
  external: true
```
**Risk:** External network access without clear documentation of its purpose and security implications.

## Medium Severity Issues

### 7. Redis Without Authentication (MEDIUM)
**Location:** docker-compose.yml:84-96, .env.example:18
- Redis service configured without password
- REDIS_PASSWORD environment variable is empty
**Risk:** Unauthorized access to job queue data

### 8. Sensitive Data in Environment Variables (MEDIUM)
**Location:** Throughout docker-compose.yml
- Database credentials
- Encryption keys
- API tokens
- All passed via environment variables without encryption

### 9. Insecure External Module Allowlist (MEDIUM)
**Location:** docker-compose.yml:53, 233
```yaml
NODE_FUNCTION_ALLOW_EXTERNAL=ajv,ajv-formats,puppeteer,ffmpeg,git,graphicsmagick,openssh-client
```
**Risk:** Allowing external tools like git and openssh-client in Node functions increases attack surface.

### 10. Missing Network Segmentation (MEDIUM)
All services share the same network, no isolation between components.

## Low Severity Issues

### 11. Outdated Dependencies (LOW)
**Location:** autoscaler/requirements.txt
- No version pinning for Python packages
- Risk of introducing vulnerabilities through updates

### 12. Verbose Error Logging (LOW)
**Location:** autoscaler/autoscaler.py:130-134
- Detailed error messages could leak system information

### 13. Missing Security Headers (LOW)
- No security headers configured in Traefik
- No rate limiting configured

## Recommendations

### Immediate Actions Required:
1. **Remove Docker socket mounting** or use Docker API proxy with limited permissions
2. **Change all default passwords and keys** in .env.example
3. **Enable Redis authentication**
4. **Run containers as non-root users**
5. **Implement input validation** for all environment variables used in commands

### Security Hardening:
1. **Network Segmentation:**
   ```yaml
   networks:
     frontend:
     backend:
     management:
   ```

2. **Redis Authentication:**
   ```yaml
   redis:
     command: redis-server --requirepass ${REDIS_PASSWORD}
   ```

3. **Non-root User:**
   ```dockerfile
   RUN useradd -m -u 1000 n8n
   USER n8n
   ```

4. **Secrets Management:**
   - Use Docker secrets instead of environment variables
   - Implement HashiCorp Vault or similar for production

5. **Input Validation:**
   ```python
   import re
   def validate_service_name(name):
       if not re.match(r'^[a-zA-Z0-9_-]+$', name):
           raise ValueError("Invalid service name")
   ```

### Additional Recommendations:
- Implement comprehensive logging and monitoring
- Add security scanning to CI/CD pipeline
- Regular dependency updates with security patches
- Implement least-privilege access controls
- Add rate limiting and DDoS protection
- Document security best practices for deployment

## Conclusion

While the n8n-autoscaling system provides useful functionality, several security issues need immediate attention. The most critical issues involve Docker socket exposure and weak authentication mechanisms. Implementing the recommended security measures will significantly improve the overall security posture of the system.