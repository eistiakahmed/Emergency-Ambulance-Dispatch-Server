import { env } from '../../config/env.js';
import { BadRequestError } from '../errors/AppError.js';
import { RedisService } from './redis.service.js';

export interface BkashCreatePaymentParams {
  amount: number | string;
  merchantInvoiceNumber: string;
  payerReference?: string;
  callbackURL?: string;
  mode?: '0011' | '0001';
  agreementID?: string;
}

export interface BkashCreatePaymentResponse {
  statusCode: string;
  statusMessage: string;
  paymentID: string;
  bkashURL: string;
  callbackURL: string;
  successCallbackURL?: string;
  failureCallbackURL?: string;
  cancelledCallbackURL?: string;
  amount: string;
  currency: string;
  intent: string;
  merchantInvoiceNumber: string;
  transactionStatus: string;
  agreementID?: string;
}

export interface BkashExecutePaymentResponse {
  statusCode: string;
  statusMessage: string;
  paymentID: string;
  agreementID?: string;
  payerReference?: string;
  customerMsisdn?: string;
  trxID: string;
  amount: string;
  transactionStatus: string;
  paymentExecuteTime?: string;
  currency: string;
  intent: string;
  merchantInvoiceNumber: string;
}

export interface BkashQueryPaymentResponse {
  statusCode: string;
  statusMessage: string;
  paymentID: string;
  mode?: string;
  paymentCreateTime?: string;
  paymentExecuteTime?: string;
  amount: string;
  currency: string;
  intent: string;
  merchantInvoice?: string;
  merchantInvoiceNumber?: string;
  transactionStatus: string;
  verificationStatus?: string;
  payerReference?: string;
  trxID?: string;
  agreementID?: string;
  agreementStatus?: string;
}

export interface BkashCapturePaymentResponse {
  statusCode?: string;
  statusMessage?: string;
  paymentID?: string;
  paymentId?: string;
  createTime?: string;
  updateTime?: string;
  trxID?: string;
  transactionStatus?: string;
  errorCode?: string;
  errorMessage?: string;
}

export class BkashService {
  private static REDIS_ID_TOKEN_KEY = 'bkash:auth:id_token';
  private static REDIS_REFRESH_TOKEN_KEY = 'bkash:auth:refresh_token';

  /**
   * 1. Grant Token
   * POST {base_URL}/tokenized/checkout/token/grant
   */
  static async grantToken(): Promise<string> {
    if (!env.BKASH_APP_KEY || !env.BKASH_APP_SECRET || !env.BKASH_USERNAME || !env.BKASH_PASSWORD) {
      throw new BadRequestError(
        'bKash credentials are not fully configured in environment variables'
      );
    }

    const endpoint = `${env.BKASH_BASE_URL}/tokenized/checkout/token/grant`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        username: env.BKASH_USERNAME,
        password: env.BKASH_PASSWORD,
      },
      body: JSON.stringify({
        app_key: env.BKASH_APP_KEY,
        app_secret: env.BKASH_APP_SECRET,
      }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || (data.statusCode && data.statusCode !== '0000') || !data.id_token) {
      const errMsg =
        data.statusMessage ||
        data.errorMessage ||
        `HTTP ${response.status}: Failed to grant bKash token`;
      throw new BadRequestError(`bKash Grant Token Error: ${errMsg}`);
    }

    const expiresIn = Number(data.expires_in) || 3600;
    // Cache token with safe buffer (5 minutes before official expiration)
    const ttl = Math.max(300, expiresIn - 300);

    await RedisService.set(BkashService.REDIS_ID_TOKEN_KEY, data.id_token, ttl);
    if (data.refresh_token) {
      // Refresh token valid for 28 days or long TTL
      await RedisService.set(BkashService.REDIS_REFRESH_TOKEN_KEY, data.refresh_token, 86400 * 25);
    }

    return data.id_token;
  }

  /**
   * 2. Refresh Token
   * POST {base_URL}/tokenized/checkout/token/refresh
   */
  static async refreshToken(): Promise<string> {
    const storedRefreshToken = await RedisService.get<string>(BkashService.REDIS_REFRESH_TOKEN_KEY);
    if (!storedRefreshToken) {
      return BkashService.grantToken();
    }

    const endpoint = `${env.BKASH_BASE_URL}/tokenized/checkout/token/refresh`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          username: env.BKASH_USERNAME,
          password: env.BKASH_PASSWORD,
        },
        body: JSON.stringify({
          app_key: env.BKASH_APP_KEY,
          app_secret: env.BKASH_APP_SECRET,
          refresh_token: storedRefreshToken,
        }),
      });

      const data = (await response.json()) as any;

      if (!response.ok || (data.statusCode && data.statusCode !== '0000') || !data.id_token) {
        console.warn('bKash refresh token expired or failed; falling back to grantToken()');
        return BkashService.grantToken();
      }

      const expiresIn = Number(data.expires_in) || 3600;
      const ttl = Math.max(300, expiresIn - 300);

      await RedisService.set(BkashService.REDIS_ID_TOKEN_KEY, data.id_token, ttl);
      if (data.refresh_token) {
        await RedisService.set(
          BkashService.REDIS_REFRESH_TOKEN_KEY,
          data.refresh_token,
          86400 * 25
        );
      }

      return data.id_token;
    } catch {
      return BkashService.grantToken();
    }
  }

  /**
   * Retrieve active id_token from cache or renew
   */
  static async getActiveToken(): Promise<string> {
    const cachedToken = await RedisService.get<string>(BkashService.REDIS_ID_TOKEN_KEY);
    if (cachedToken) {
      return cachedToken;
    }
    return BkashService.refreshToken();
  }

  /**
   * 3. Create Payment
   * POST {base_URL}/tokenized/checkout/create
   */
  static async createPayment(
    params: BkashCreatePaymentParams
  ): Promise<BkashCreatePaymentResponse> {
    const token = await BkashService.getActiveToken();
    const endpoint = `${env.BKASH_BASE_URL}/tokenized/checkout/create`;

    const requestBody: Record<string, any> = {
      mode: params.mode || '0011',
      payerReference: params.payerReference || '01700000000',
      callbackURL: params.callbackURL || env.BKASH_CALLBACK_URL,
      amount: String(params.amount),
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: params.merchantInvoiceNumber,
    };

    if (params.agreementID) {
      requestBody.agreementID = params.agreementID;
      requestBody.mode = '0001';
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: token,
        'X-App-Key': env.BKASH_APP_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    const data = (await response.json()) as any;

    if (!response.ok || (data.statusCode && data.statusCode !== '0000') || !data.paymentID) {
      const errMsg =
        data.statusMessage ||
        data.errorMessage ||
        `HTTP ${response.status}: Failed to create bKash payment`;
      throw new BadRequestError(`bKash Create Payment Error: ${errMsg}`);
    }

    return data as BkashCreatePaymentResponse;
  }

  /**
   * 4. Execute Payment
   * POST {base_URL}/tokenized/checkout/execute
   */
  static async executePayment(paymentID: string): Promise<BkashExecutePaymentResponse> {
    const token = await BkashService.getActiveToken();
    const endpoint = `${env.BKASH_BASE_URL}/tokenized/checkout/execute`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: token,
        'X-App-Key': env.BKASH_APP_KEY,
      },
      body: JSON.stringify({ paymentID }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || (data.statusCode && data.statusCode !== '0000')) {
      const errMsg =
        data.statusMessage ||
        data.errorMessage ||
        `HTTP ${response.status}: Failed to execute bKash payment`;
      throw new BadRequestError(`bKash Execute Payment Error: ${errMsg}`);
    }

    return data as BkashExecutePaymentResponse;
  }

  /**
   * 5. Query Payment Status
   * POST {base_URL}/tokenized/checkout/payment/status
   */
  static async queryPaymentStatus(paymentID: string): Promise<BkashQueryPaymentResponse> {
    const token = await BkashService.getActiveToken();
    const endpoint = `${env.BKASH_BASE_URL}/tokenized/checkout/payment/status`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: token,
        'X-App-Key': env.BKASH_APP_KEY,
      },
      body: JSON.stringify({ paymentID }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || (data.statusCode && data.statusCode !== '0000')) {
      const errMsg =
        data.statusMessage ||
        data.errorMessage ||
        `HTTP ${response.status}: Failed to query bKash payment`;
      throw new BadRequestError(`bKash Query Payment Error: ${errMsg}`);
    }

    return data as BkashQueryPaymentResponse;
  }

  /**
   * 6. Confirm / Capture Payment
   * POST {base_URL}/tokenized/checkout/payment/confirm/capture
   */
  static async capturePayment(paymentID: string): Promise<BkashCapturePaymentResponse> {
    const token = await BkashService.getActiveToken();
    const endpoint = `${env.BKASH_BASE_URL}/tokenized/checkout/payment/confirm/capture`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: token,
        'X-App-Key': env.BKASH_APP_KEY,
      },
      body: JSON.stringify({ paymentID }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || (data.statusCode && data.statusCode !== '0000' && data.errorCode)) {
      const errMsg =
        data.statusMessage ||
        data.errorMessage ||
        `HTTP ${response.status}: Failed to capture bKash payment`;
      throw new BadRequestError(`bKash Capture Payment Error: ${errMsg}`);
    }

    return data as BkashCapturePaymentResponse;
  }
}
