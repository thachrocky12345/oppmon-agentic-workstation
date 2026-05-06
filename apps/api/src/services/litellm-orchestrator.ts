/**
 * LiteLLM Container Orchestrator
 * Manages per-tenant LiteLLM Docker containers
 */

import Docker from 'dockerode';
import { createHash, randomBytes } from 'crypto';
import { prisma, RoutingStatus } from '@oppmon/database';
import { generateLiteLLMConfig } from './litellm-config-generator.js';
import { storeSecret, retrieveSecret } from '../crypto/secret-vault.js';

// ============================================================================
// Types
// ============================================================================

export interface HealthResult {
  healthy: boolean;
  status: RoutingStatus;
  lastCheck: Date;
  error?: string;
  responseTime?: number;
}

export interface ContainerInfo {
  id: string;
  name: string;
  status: string;
  state: string;
  startedAt?: Date;
  ports: Array<{ container: number; host?: number }>;
}

// ============================================================================
// Configuration
// ============================================================================

const LITELLM_IMAGE = process.env.LITELLM_IMAGE || 'ghcr.io/berriai/litellm:main-latest';
const LITELLM_INTERNAL_PORT = 4000;
const CONTAINER_PREFIX = 'litellm-tag';
const CONTAINER_NETWORK = process.env.DOCKER_NETWORK || 'oppmon-internal';
const MAX_RESTARTS = 3;
const HEALTH_CHECK_TIMEOUT_MS = 5000;

// Resource limits
const MEMORY_LIMIT = '512m';
const CPU_LIMIT = 1;

// ============================================================================
// Docker Client
// ============================================================================

let dockerClient: Docker | null = null;

function getDocker(): Docker {
  if (!dockerClient) {
    // Connect to Docker socket
    dockerClient = new Docker({
      socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
    });
  }
  return dockerClient;
}

// ============================================================================
// Container Naming
// ============================================================================

function getContainerName(tenantId: string): string {
  // Use a hash of tenant ID for shorter, consistent names
  const hash = createHash('sha256').update(tenantId).digest('hex').substring(0, 12);
  return `${CONTAINER_PREFIX}-${hash}`;
}

// ============================================================================
// Master Key Management
// ============================================================================

async function getOrCreateMasterKey(tenantId: string): Promise<string> {
  const state = await prisma.tenantRoutingState.findUnique({
    where: { tenantId },
  });

  if (state?.masterKeySecretRef) {
    try {
      const secrets = await retrieveSecret(state.masterKeySecretRef);
      return secrets.master_key;
    } catch {
      // Key decryption failed, create new one
    }
  }

  // Generate new master key
  const masterKey = `sk-litellm-${randomBytes(24).toString('hex')}`;
  const secretRef = await storeSecret(tenantId, { master_key: masterKey });

  await prisma.tenantRoutingState.upsert({
    where: { tenantId },
    create: {
      tenantId,
      masterKeySecretRef: secretRef,
      status: 'STOPPED',
    },
    update: {
      masterKeySecretRef: secretRef,
    },
  });

  return masterKey;
}

// ============================================================================
// Container Operations
// ============================================================================

/**
 * Ensure LiteLLM container is running for a tenant
 */
export async function ensureRunning(tenantId: string): Promise<void> {
  const docker = getDocker();
  const containerName = getContainerName(tenantId);

  // Update state to provisioning
  await updateRoutingState(tenantId, 'PROVISIONING');

  try {
    // Check if container already exists
    const containers = await docker.listContainers({
      all: true,
      filters: { name: [containerName] },
    });

    if (containers.length > 0) {
      const container = docker.getContainer(containers[0].Id);
      const info = await container.inspect();

      if (info.State.Running) {
        // Already running, just reload config
        await reloadConfig(tenantId);
        await updateRoutingState(tenantId, 'RUNNING');
        return;
      }

      // Exists but not running, start it
      await container.start();
      await reloadConfig(tenantId);
      await updateRoutingState(tenantId, 'RUNNING');
      return;
    }

    // Create new container
    await createContainer(tenantId, containerName);
    await updateRoutingState(tenantId, 'RUNNING');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await updateRoutingState(tenantId, 'FAILED', message);
    throw error;
  }
}

/**
 * Create a new LiteLLM container for a tenant
 */
async function createContainer(tenantId: string, containerName: string): Promise<void> {
  const docker = getDocker();

  // Generate config and master key
  const config = await generateLiteLLMConfig(tenantId);
  const masterKey = await getOrCreateMasterKey(tenantId);

  // Pull image if not exists
  try {
    await docker.getImage(LITELLM_IMAGE).inspect();
  } catch {
    console.log(`Pulling LiteLLM image: ${LITELLM_IMAGE}`);
    const stream = await docker.pull(LITELLM_IMAGE);
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve(undefined);
      });
    });
  }

  // Create container with config via environment variable
  const container = await docker.createContainer({
    name: containerName,
    Image: LITELLM_IMAGE,
    Env: [
      `LITELLM_CONFIG=${Buffer.from(config).toString('base64')}`,
      `LITELLM_MASTER_KEY=${masterKey}`,
      'LITELLM_LOG_LEVEL=INFO',
    ],
    ExposedPorts: {
      [`${LITELLM_INTERNAL_PORT}/tcp`]: {},
    },
    HostConfig: {
      Memory: parseMemoryLimit(MEMORY_LIMIT),
      NanoCpus: CPU_LIMIT * 1e9,
      RestartPolicy: {
        Name: 'unless-stopped',
        MaximumRetryCount: MAX_RESTARTS,
      },
      NetworkMode: CONTAINER_NETWORK,
    },
    Labels: {
      'oppmon.tenant': tenantId,
      'oppmon.type': 'litellm',
    },
  });

  // Start container
  await container.start();

  // Update state with container name
  await prisma.tenantRoutingState.update({
    where: { tenantId },
    data: {
      litellmContainerName: containerName,
      status: 'RUNNING',
      restartCount: 0,
      lastError: null,
    },
  });
}

/**
 * Stop a tenant's LiteLLM container
 */
export async function stop(tenantId: string): Promise<void> {
  const docker = getDocker();
  const containerName = getContainerName(tenantId);

  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { name: [containerName] },
    });

    if (containers.length > 0) {
      const container = docker.getContainer(containers[0].Id);
      await container.stop({ t: 10 });
    }

    await updateRoutingState(tenantId, 'STOPPED');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await updateRoutingState(tenantId, 'FAILED', message);
    throw error;
  }
}

/**
 * Remove a tenant's LiteLLM container completely
 */
export async function removeContainer(tenantId: string): Promise<void> {
  const docker = getDocker();
  const containerName = getContainerName(tenantId);

  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { name: [containerName] },
    });

    if (containers.length > 0) {
      const container = docker.getContainer(containers[0].Id);

      // Stop if running
      const info = await container.inspect();
      if (info.State.Running) {
        await container.stop({ t: 10 });
      }

      // Remove container
      await container.remove({ force: true });
    }

    // Clear state
    await prisma.tenantRoutingState.update({
      where: { tenantId },
      data: {
        litellmContainerName: null,
        status: 'STOPPED',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to remove container for tenant ${tenantId}:`, message);
    throw error;
  }
}

/**
 * Reload LiteLLM configuration (hot reload via API)
 */
export async function reloadConfig(tenantId: string): Promise<void> {
  const containerName = getContainerName(tenantId);

  try {
    // Generate new config
    const config = await generateLiteLLMConfig(tenantId);

    // Get container internal IP
    const docker = getDocker();
    const containers = await docker.listContainers({
      filters: { name: [containerName] },
    });

    if (containers.length === 0) {
      throw new Error(`Container ${containerName} not found`);
    }

    const container = docker.getContainer(containers[0].Id);
    const info = await container.inspect();

    // Get IP from the oppmon network
    const networkSettings = info.NetworkSettings.Networks[CONTAINER_NETWORK];
    if (!networkSettings) {
      throw new Error(`Container not connected to ${CONTAINER_NETWORK} network`);
    }

    const containerIp = networkSettings.IPAddress;

    // Call LiteLLM config reload endpoint
    const response = await fetch(
      `http://${containerIp}:${LITELLM_INTERNAL_PORT}/config/reload`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config_yaml: config }),
      }
    );

    if (!response.ok) {
      throw new Error(`Config reload failed: ${response.status}`);
    }

    // Update sync timestamp on all models
    await prisma.model.updateMany({
      where: {
        tenantId,
        enabled: true,
        deletedAt: null,
      },
      data: {
        lastSyncedAt: new Date(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to reload config for tenant ${tenantId}:`, message);
    throw error;
  }
}

/**
 * Perform health check on a tenant's LiteLLM container
 */
export async function healthCheck(tenantId: string): Promise<HealthResult> {
  const containerName = getContainerName(tenantId);
  const startTime = Date.now();

  try {
    const docker = getDocker();
    const containers = await docker.listContainers({
      filters: { name: [containerName] },
    });

    if (containers.length === 0) {
      return {
        healthy: false,
        status: 'STOPPED',
        lastCheck: new Date(),
        error: 'Container not found',
      };
    }

    const container = docker.getContainer(containers[0].Id);
    const info = await container.inspect();

    if (!info.State.Running) {
      return {
        healthy: false,
        status: 'STOPPED',
        lastCheck: new Date(),
        error: `Container state: ${info.State.Status}`,
      };
    }

    // Get container IP
    const networkSettings = info.NetworkSettings.Networks[CONTAINER_NETWORK];
    if (!networkSettings) {
      return {
        healthy: false,
        status: 'DEGRADED',
        lastCheck: new Date(),
        error: 'Container not on expected network',
      };
    }

    const containerIp = networkSettings.IPAddress;

    // Check LiteLLM health endpoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    try {
      const response = await fetch(
        `http://${containerIp}:${LITELLM_INTERNAL_PORT}/health`,
        { signal: controller.signal }
      );

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        // Update state
        await updateRoutingState(tenantId, 'RUNNING');

        return {
          healthy: true,
          status: 'RUNNING',
          lastCheck: new Date(),
          responseTime,
        };
      }

      return {
        healthy: false,
        status: 'DEGRADED',
        lastCheck: new Date(),
        error: `Health check returned ${response.status}`,
        responseTime,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check restart count
    const state = await prisma.tenantRoutingState.findUnique({
      where: { tenantId },
    });

    const restartCount = (state?.restartCount || 0) + 1;
    const newStatus: RoutingStatus =
      restartCount >= MAX_RESTARTS ? 'FAILED' : 'DEGRADED';

    await updateRoutingState(tenantId, newStatus, message, restartCount);

    return {
      healthy: false,
      status: newStatus,
      lastCheck: new Date(),
      error: message,
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * Get container info for a tenant
 */
export async function getContainerInfo(tenantId: string): Promise<ContainerInfo | null> {
  const docker = getDocker();
  const containerName = getContainerName(tenantId);

  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { name: [containerName] },
    });

    if (containers.length === 0) {
      return null;
    }

    const containerData = containers[0];
    const container = docker.getContainer(containerData.Id);
    const info = await container.inspect();

    return {
      id: containerData.Id,
      name: containerName,
      status: containerData.Status,
      state: containerData.State,
      startedAt: info.State.StartedAt ? new Date(info.State.StartedAt) : undefined,
      ports: Object.entries(containerData.Ports || {}).map(([key, binding]) => ({
        container: parseInt(key.split('/')[0], 10),
        host: binding?.[0]?.HostPort ? parseInt(binding[0].HostPort, 10) : undefined,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Get the internal URL for a tenant's LiteLLM instance
 */
export async function getInternalUrl(tenantId: string): Promise<string | null> {
  const containerName = getContainerName(tenantId);

  try {
    const docker = getDocker();
    const containers = await docker.listContainers({
      filters: { name: [containerName] },
    });

    if (containers.length === 0) {
      return null;
    }

    const container = docker.getContainer(containers[0].Id);
    const info = await container.inspect();

    const networkSettings = info.NetworkSettings.Networks[CONTAINER_NETWORK];
    if (!networkSettings) {
      return null;
    }

    return `http://${networkSettings.IPAddress}:${LITELLM_INTERNAL_PORT}`;
  } catch {
    return null;
  }
}

// ============================================================================
// State Management
// ============================================================================

async function updateRoutingState(
  tenantId: string,
  status: RoutingStatus,
  error?: string,
  restartCount?: number
): Promise<void> {
  await prisma.tenantRoutingState.upsert({
    where: { tenantId },
    create: {
      tenantId,
      status,
      lastHealthCheckAt: new Date(),
      lastError: error,
      restartCount: restartCount || 0,
    },
    update: {
      status,
      lastHealthCheckAt: new Date(),
      lastError: error,
      ...(restartCount !== undefined ? { restartCount } : {}),
    },
  });
}

// ============================================================================
// Utilities
// ============================================================================

function parseMemoryLimit(limit: string): number {
  const match = limit.match(/^(\d+)([kmg]?)$/i);
  if (!match) {
    return 512 * 1024 * 1024; // Default 512MB
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'k':
      return value * 1024;
    case 'm':
      return value * 1024 * 1024;
    case 'g':
      return value * 1024 * 1024 * 1024;
    default:
      return value;
  }
}

// ============================================================================
// Background Health Check Job
// ============================================================================

let healthCheckInterval: NodeJS.Timeout | null = null;

/**
 * Start background health check job
 */
export function startHealthCheckJob(intervalMs: number = 60000): void {
  if (healthCheckInterval) {
    return;
  }

  healthCheckInterval = setInterval(async () => {
    try {
      // Get all tenants with running/degraded containers
      const states = await prisma.tenantRoutingState.findMany({
        where: {
          status: { in: ['RUNNING', 'DEGRADED', 'PROVISIONING'] },
        },
      });

      for (const state of states) {
        try {
          await healthCheck(state.tenantId);
        } catch (error) {
          console.error(`Health check failed for tenant ${state.tenantId}:`, error);
        }
      }
    } catch (error) {
      console.error('Background health check job failed:', error);
    }
  }, intervalMs);
}

/**
 * Stop background health check job
 */
export function stopHealthCheckJob(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}
