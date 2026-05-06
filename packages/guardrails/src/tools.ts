/**
 * Tool Execution Guards
 *
 * Pre and post-execution guards for tool calls.
 */

import type { ToolGuard, GuardResult, ExecutionContext } from './types.js'

// =============================================================================
// Tool Guard Registry
// =============================================================================

export class ToolGuardRegistry {
  private guards: ToolGuard[] = []

  /**
   * Register a tool guard
   */
  register(guard: ToolGuard): void {
    this.guards.push(guard)
  }

  /**
   * Check all guards before tool execution
   */
  preExecute(tool: string, args: unknown, context: ExecutionContext): GuardResult {
    for (const guard of this.guards) {
      if (this.appliesToTool(guard, tool)) {
        const result = guard.preExecute(tool, args, context)
        if (!result.allowed) {
          return result
        }
      }
    }
    return { allowed: true }
  }

  /**
   * Check all guards after tool execution
   */
  postExecute(tool: string, result: unknown, context: ExecutionContext): GuardResult {
    for (const guard of this.guards) {
      if (guard.postExecute && this.appliesToTool(guard, tool)) {
        const guardResult = guard.postExecute(tool, result, context)
        if (!guardResult.allowed) {
          return guardResult
        }
      }
    }
    return { allowed: true }
  }

  private appliesToTool(guard: ToolGuard, tool: string): boolean {
    if (guard.appliesTo.includes('*')) return true
    return guard.appliesTo.some((pattern) => {
      if (pattern.endsWith('*')) {
        return tool.startsWith(pattern.slice(0, -1))
      }
      return tool === pattern
    })
  }
}

// =============================================================================
// Shell Command Guard
// =============================================================================

export class ShellGuard implements ToolGuard {
  name = 'shell'
  appliesTo = ['execute_command', 'run_script', 'shell', 'bash', 'exec']

  private allowedCommands = new Set([
    'ls', 'dir', 'cat', 'type', 'grep', 'find', 'head', 'tail', 'wc',
    'pwd', 'cd', 'echo', 'date', 'whoami', 'hostname', 'uname',
    'git', 'npm', 'pnpm', 'yarn', 'node', 'python', 'pip',
    'curl', 'wget', 'ssh', 'scp', 'rsync',
  ])

  private blockedPatterns = [
    /rm\s+(-[rf]+\s+)+[\/~]/i,         // rm -rf with root or home
    /rm\s+-rf\s+\*/i,                   // rm -rf *
    /curl.*\|\s*(?:ba)?sh/i,            // curl | sh
    /wget.*\|\s*(?:ba)?sh/i,            // wget | sh
    />\s*\/dev\/sd/i,                   // Write to disk device
    /dd\s+if=/i,                        // dd command
    /mkfs/i,                            // Format filesystem
    /:()\{\s*:\|:&\s*\};:/,             // Fork bomb
    /chmod\s+777/i,                     // Dangerous permissions
    /chown\s+.*\s+\//i,                 // Change ownership of root
    />\s*\/etc\//i,                     // Write to /etc
    />\s*\/bin\//i,                     // Write to /bin
    /shutdown/i,                        // Shutdown command
    /reboot/i,                          // Reboot command
    /init\s+0/i,                        // Init 0
    /poweroff/i,                        // Power off
    /halt/i,                            // Halt
  ]

  preExecute(tool: string, args: unknown, context: ExecutionContext): GuardResult {
    const command = this.extractCommand(args)
    if (!command) {
      return { allowed: true }
    }

    const normalizedCmd = command.toLowerCase().trim()

    // Check blocked patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(normalizedCmd)) {
        return {
          allowed: false,
          reason: `Blocked dangerous command pattern. This command could cause system damage.`,
        }
      }
    }

    // Check if command starts with allowed command
    const firstWord = normalizedCmd.split(/\s+/)[0].replace(/^\.?\//, '')
    if (!this.allowedCommands.has(firstWord)) {
      // Check if user has elevated permissions
      if (context.permissions.includes('shell.unrestricted')) {
        return { allowed: true }
      }

      return {
        allowed: false,
        reason: `Command '${firstWord}' requires explicit approval. Allowed: ${Array.from(this.allowedCommands).slice(0, 10).join(', ')}...`,
      }
    }

    return { allowed: true }
  }

  private extractCommand(args: unknown): string | null {
    if (typeof args === 'string') return args
    if (typeof args === 'object' && args !== null) {
      const obj = args as Record<string, unknown>
      return (obj.command ?? obj.cmd ?? obj.script) as string | null
    }
    return null
  }
}

// =============================================================================
// SQL Guard
// =============================================================================

export class SQLGuard implements ToolGuard {
  name = 'sql'
  appliesTo = ['execute_sql', 'raw_query', 'database_query', 'sql']

  private blockedStatements = new Set([
    'DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE', 'INSERT', 'UPDATE',
    'GRANT', 'REVOKE', 'REPLACE', 'MERGE', 'EXEC', 'EXECUTE',
  ])

  private dangerousPatterns = [
    /;\s*(?:DROP|DELETE|TRUNCATE)/i,  // Multi-statement attacks
    /UNION\s+SELECT/i,                 // Union injection
    /OR\s+['"]?1['"]?\s*=\s*['"]?1/i, // OR 1=1 injection
    /--\s*$/m,                         // SQL comment at end
    /\/\*.*\*\//,                      // Block comments
    /SLEEP\s*\(/i,                     // Time-based injection
    /BENCHMARK\s*\(/i,                 // Benchmark injection
    /LOAD_FILE\s*\(/i,                 // File access
    /INTO\s+OUTFILE/i,                 // File write
    /INTO\s+DUMPFILE/i,                // File dump
  ]

  preExecute(tool: string, args: unknown, context: ExecutionContext): GuardResult {
    const query = this.extractQuery(args)
    if (!query) {
      return { allowed: true }
    }

    const normalizedQuery = query.toUpperCase().trim()

    // Check for blocked statements
    for (const stmt of this.blockedStatements) {
      if (normalizedQuery.includes(stmt)) {
        // Allow if user has write permissions
        if (context.permissions.includes('database.write')) {
          return { allowed: true }
        }

        return {
          allowed: false,
          reason: `Write operation (${stmt}) requires explicit approval. Agent has read-only database access.`,
        }
      }
    }

    // Check dangerous patterns
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(query)) {
        return {
          allowed: false,
          reason: `Potentially dangerous SQL pattern detected. Review query for injection vulnerabilities.`,
        }
      }
    }

    return { allowed: true }
  }

  private extractQuery(args: unknown): string | null {
    if (typeof args === 'string') return args
    if (typeof args === 'object' && args !== null) {
      const obj = args as Record<string, unknown>
      return (obj.query ?? obj.sql ?? obj.statement) as string | null
    }
    return null
  }
}

// =============================================================================
// Network Guard
// =============================================================================

export class NetworkGuard implements ToolGuard {
  name = 'network'
  appliesTo = ['http_request', 'fetch_url', 'call_api', 'fetch', 'request']

  private blockedHosts = new Set([
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '169.254.169.254', // AWS metadata
    'metadata.google.internal', // GCP metadata
  ])

  private blockedPorts = new Set([22, 23, 25, 445, 3389, 5900])

  private internalPatterns = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /\.internal$/,
    /\.local$/,
  ]

  preExecute(tool: string, args: unknown, context: ExecutionContext): GuardResult {
    const url = this.extractUrl(args)
    if (!url) {
      return { allowed: true }
    }

    try {
      const parsed = new URL(url)

      // Check blocked hosts
      if (this.blockedHosts.has(parsed.hostname.toLowerCase())) {
        return {
          allowed: false,
          reason: `Access to ${parsed.hostname} is blocked. Cannot access internal/metadata services.`,
        }
      }

      // Check internal IP patterns
      for (const pattern of this.internalPatterns) {
        if (pattern.test(parsed.hostname)) {
          if (!context.permissions.includes('network.internal')) {
            return {
              allowed: false,
              reason: `Access to internal networks requires explicit approval.`,
            }
          }
        }
      }

      // Check blocked ports
      const port = parseInt(parsed.port || '0')
      if (port && this.blockedPorts.has(port)) {
        return {
          allowed: false,
          reason: `Access to port ${port} is restricted.`,
        }
      }

      return { allowed: true }
    } catch {
      return { allowed: true } // Invalid URL, let it fail naturally
    }
  }

  private extractUrl(args: unknown): string | null {
    if (typeof args === 'string') return args
    if (typeof args === 'object' && args !== null) {
      const obj = args as Record<string, unknown>
      return (obj.url ?? obj.endpoint ?? obj.uri) as string | null
    }
    return null
  }
}

// =============================================================================
// File System Guard
// =============================================================================

export class FileGuard implements ToolGuard {
  name = 'file'
  appliesTo = ['write_file', 'delete_file', 'modify_file', 'create_file', 'file_write']

  private blockedPaths = [
    /^\/etc\//,
    /^\/bin\//,
    /^\/sbin\//,
    /^\/usr\//,
    /^\/boot\//,
    /^\/dev\//,
    /^\/proc\//,
    /^\/sys\//,
    /^C:\\Windows\\/i,
    /^C:\\Program Files/i,
    /^C:\\System/i,
  ]

  private sensitiveFiles = [
    /\.env$/i,
    /\.pem$/i,
    /\.key$/i,
    /id_rsa/i,
    /id_ed25519/i,
    /credentials/i,
    /secrets/i,
    /password/i,
    /\.ssh\//i,
    /\.aws\//i,
    /\.kube\//i,
  ]

  preExecute(tool: string, args: unknown, context: ExecutionContext): GuardResult {
    const path = this.extractPath(args)
    if (!path) {
      return { allowed: true }
    }

    // Check blocked system paths
    for (const pattern of this.blockedPaths) {
      if (pattern.test(path)) {
        return {
          allowed: false,
          reason: `Cannot modify system paths. Path ${path} is protected.`,
        }
      }
    }

    // Check sensitive files
    for (const pattern of this.sensitiveFiles) {
      if (pattern.test(path)) {
        if (!context.permissions.includes('file.sensitive')) {
          return {
            allowed: false,
            reason: `Writing to sensitive files requires explicit approval.`,
          }
        }
      }
    }

    return { allowed: true }
  }

  private extractPath(args: unknown): string | null {
    if (typeof args === 'string') return args
    if (typeof args === 'object' && args !== null) {
      const obj = args as Record<string, unknown>
      return (obj.path ?? obj.file ?? obj.filename) as string | null
    }
    return null
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a registry with all default guards
 */
export function createDefaultGuardRegistry(): ToolGuardRegistry {
  const registry = new ToolGuardRegistry()
  registry.register(new ShellGuard())
  registry.register(new SQLGuard())
  registry.register(new NetworkGuard())
  registry.register(new FileGuard())
  return registry
}
