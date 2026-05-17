// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * AWS Bedrock Connection Validator
 * Tests AWS credentials and Bedrock model access
 */

import type { ConnectionTestResult } from '@oppmon/shared';
import {
  type ValidationContext,
  registerValidator,
  translateHttpError,
} from '../connection-validator.js';
import { createHmac, createHash } from 'crypto';

const DEFAULT_TIMEOUT_MS = 30000;

async function validateBedrock(
  context: ValidationContext
): Promise<ConnectionTestResult> {
  const { publicConfig, secretConfig, timeoutMs = DEFAULT_TIMEOUT_MS } = context;

  const accessKeyId = secretConfig.aws_access_key_id;
  const secretAccessKey = secretConfig.aws_secret_access_key;
  const region = publicConfig.aws_region_name as string;
  const model = publicConfig.model as string;
  const authMethod = publicConfig.auth_method as string;

  // Skip validation for IAM role (will work at runtime)
  if (authMethod === 'iam_role') {
    return {
      ok: true,
      latencyMs: 0,
      modelInfo: {
        name: model,
        provider: 'bedrock',
      },
    };
  }

  // Validate required fields for IAM keys
  if (authMethod === 'iam_keys') {
    if (!accessKeyId) {
      return {
        ok: false,
        latencyMs: 0,
        error: {
          code: 'MISSING_ACCESS_KEY',
          message: 'AWS Access Key ID is required',
          hint: 'Provide your AWS access key ID.',
        },
      };
    }

    if (!secretAccessKey) {
      return {
        ok: false,
        latencyMs: 0,
        error: {
          code: 'MISSING_SECRET_KEY',
          message: 'AWS Secret Access Key is required',
          hint: 'Provide your AWS secret access key.',
        },
      };
    }
  }

  if (!region) {
    return {
      ok: false,
      latencyMs: 0,
      error: {
        code: 'MISSING_REGION',
        message: 'AWS region is required',
        hint: 'Select an AWS region.',
      },
    };
  }

  if (!model) {
    return {
      ok: false,
      latencyMs: 0,
      error: {
        code: 'MISSING_MODEL',
        message: 'Model is required',
        hint: 'Select a Bedrock model to use.',
      },
    };
  }

  try {
    // Use STS GetCallerIdentity to verify credentials
    const stsResult = await callSts(
      accessKeyId,
      secretAccessKey,
      region,
      timeoutMs
    );

    if (!stsResult.ok) {
      return stsResult;
    }

    // Try to invoke the model with minimal prompt
    const invokeResult = await invokeBedrockModel(
      accessKeyId,
      secretAccessKey,
      region,
      model,
      timeoutMs
    );

    return invokeResult;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        latencyMs: 0,
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out',
          hint: 'AWS is slow to respond. Try again.',
        },
      };
    }
    throw error;
  }
}

async function callSts(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  timeoutMs: number
): Promise<ConnectionTestResult> {
  const host = `sts.${region}.amazonaws.com`;
  const url = `https://${host}/`;
  const method = 'POST';
  const service = 'sts';
  const body = 'Action=GetCallerIdentity&Version=2011-06-15';

  const headers = signAWSRequest(
    method,
    url,
    host,
    service,
    region,
    accessKeyId,
    secretAccessKey,
    body,
    { 'Content-Type': 'application/x-www-form-urlencoded' }
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const translated = translateHttpError(
        { status: response.status, provider: 'bedrock' },
        {
          403: 'AWS credentials are invalid or expired. Check your access key and secret.',
        }
      );
      return { ok: false, latencyMs: 0, error: translated };
    }

    return { ok: true, latencyMs: 0 };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function invokeBedrockModel(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  modelId: string,
  timeoutMs: number
): Promise<ConnectionTestResult> {
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const path = `/model/${encodeURIComponent(modelId)}/invoke`;
  const url = `https://${host}${path}`;
  const method = 'POST';
  const service = 'bedrock';

  // Create minimal Claude request
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 10,
    messages: [{ role: 'user', content: 'Say ok' }],
  });

  const headers = signAWSRequest(
    method,
    url,
    host,
    service,
    region,
    accessKeyId,
    secretAccessKey,
    body,
    { 'Content-Type': 'application/json' }
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const translated = translateHttpError(
        { status: response.status, provider: 'bedrock' },
        {
          403: errorText.includes('AccessDeniedException')
            ? 'Your IAM user lacks bedrock:InvokeModel permission. Update your IAM policy.'
            : 'Access denied. Check IAM permissions for Bedrock.',
          404: `Model "${modelId}" not found in ${region}. Check model ID and region.`,
        }
      );
      return { ok: false, latencyMs: 0, error: translated };
    }

    return {
      ok: true,
      latencyMs: 0,
      modelInfo: {
        name: modelId,
        provider: 'bedrock',
        contextLength: 200000,
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// AWS Signature V4 implementation
function signAWSRequest(
  method: string,
  url: string,
  host: string,
  service: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
  body: string,
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = new URL(url).pathname;
  const canonicalQueryString = '';

  const headers: Record<string, string> = {
    host,
    'x-amz-date': amzDate,
    ...additionalHeaders,
  };

  const signedHeaders = Object.keys(headers)
    .sort()
    .join(';');

  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('\n');

  const payloadHash = createHash('sha256').update(body).digest('hex');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders + '\n',
    signedHeaders,
    payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const kDate = createHmac('sha256', `AWS4${secretAccessKey}`)
    .update(dateStamp)
    .digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update(service).digest();
  const kSigning = createHmac('sha256', kService)
    .update('aws4_request')
    .digest();
  const signature = createHmac('sha256', kSigning)
    .update(stringToSign)
    .digest('hex');

  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...headers,
    Authorization: authorizationHeader,
  };
}

// Register the validator
registerValidator('bedrock', validateBedrock);

export { validateBedrock };
