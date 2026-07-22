/*
|--------------------------------------------------------------------------
| Claid Service
|--------------------------------------------------------------------------
|
| Sends product-image enhancement jobs to Claid.
|
| Responsibilities:
|
| - Build the conservative LIA image preset.
| - Submit the async Claid request.
| - Validate the accepted-task response.
| - Normalize API errors.
|
| This file contains no Firebase trigger, Firestore, Storage, or Sharp logic.
|
*/


import {
  buildProductImagePreset,
} from "./claidImagePreset";

import type {
  ClaidAcceptedTask,
  ClaidApiResponse,
  ClaidTaskResult,
} from "./claidTypes";

/*
|--------------------------------------------------------------------------
| Claid API Configuration
|--------------------------------------------------------------------------
*/

const CLAID_ASYNC_EDIT_URL =
  "https://api.claid.ai/v1/image/edit/async";

/*
|--------------------------------------------------------------------------
| Submit Parameters
|--------------------------------------------------------------------------
*/

interface SubmitClaidProductImageParams {
  inputUrl: string;

  apiKey: string;
}

/*
|--------------------------------------------------------------------------
| Claid Service
|--------------------------------------------------------------------------
*/

export const claidService = {
  /*
  |--------------------------------------------------------------------------
  | Submit Product Image
  |--------------------------------------------------------------------------
  */

  async submitProductImage({
    inputUrl,
    apiKey,
  }: SubmitClaidProductImageParams):
  Promise<ClaidAcceptedTask> {
    if (!inputUrl.trim()) {
      throw new Error(
        "A Claid input URL is required."
      );
    }

    if (!apiKey.trim()) {
      throw new Error(
        "The Claid API key is missing."
      );
    }

    const requestBody =
      buildProductImagePreset(
        inputUrl
      );

    const response =
      await fetch(
        CLAID_ASYNC_EDIT_URL,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${apiKey}`,
          },

          body:
            JSON.stringify(
              requestBody
            ),
        }
      );

    const responseText =
      await response.text();

    let parsedResponse:
      ClaidApiResponse<ClaidAcceptedTask> |
      ClaidAcceptedTask |
      null = null;

    if (responseText) {
      try {
        parsedResponse =
          JSON.parse(
            responseText
          ) as
            | ClaidApiResponse<ClaidAcceptedTask>
            | ClaidAcceptedTask;
      } catch {
        throw new Error(
          `Claid returned an invalid JSON response with status ${response.status}.`
        );
      }
    }

    if (!response.ok) {
      const wrappedError =
        parsedResponse &&
        "error" in parsedResponse
          ? parsedResponse.error
          : undefined;

      const message =
        wrappedError?.message ??
        `Claid request failed with status ${response.status}.`;

      throw new Error(message);
    }

    if (!parsedResponse) {
      throw new Error(
        "Claid returned an empty response."
      );
    }

    const acceptedTask =
      "data" in parsedResponse &&
      parsedResponse.data
        ? parsedResponse.data
        : "result" in
            parsedResponse &&
          parsedResponse.result
        ? parsedResponse.result
        : parsedResponse as
            ClaidAcceptedTask;

    if (
      typeof acceptedTask.id !==
        "number" ||
      acceptedTask.status !==
        "ACCEPTED"
    ) {
      throw new Error(
        "Claid did not return a valid accepted task."
      );
    }

    return acceptedTask;
  },

  /*
|--------------------------------------------------------------------------
| Get Task Result
|--------------------------------------------------------------------------
|
| Checks the current status of an asynchronous Claid task.
|
| Claid returns result_url when the task is accepted. We store that URL with
| the job and use it for later status checks.
|
*/

async getTaskResult({
  resultUrl,
  apiKey,
}: {
  resultUrl: string;
  apiKey: string;
}): Promise<ClaidTaskResult> {
  if (!resultUrl.trim()) {
    throw new Error(
      "A Claid result URL is required."
    );
  }

  if (!apiKey.trim()) {
    throw new Error(
      "The Claid API key is missing."
    );
  }

  const response =
    await fetch(
      resultUrl,
      {
        method:
          "GET",

        headers: {
          Authorization:
            `Bearer ${apiKey}`,
        },
      }
    );

  const responseText =
    await response.text();

  let parsedResponse:
    | ClaidApiResponse<ClaidTaskResult>
    | ClaidTaskResult
    | null = null;

  if (responseText) {
    try {
      parsedResponse =
        JSON.parse(
          responseText
        ) as
          | ClaidApiResponse<ClaidTaskResult>
          | ClaidTaskResult;
    } catch {
      throw new Error(
        `Claid returned invalid task JSON with status ${response.status}.`
      );
    }
  }

  if (!response.ok) {
    const wrappedError =
      parsedResponse &&
      "error" in parsedResponse
        ? parsedResponse.error
        : undefined;

    throw new Error(
      wrappedError?.message ??
      `Claid task request failed with status ${response.status}.`
    );
  }

  if (!parsedResponse) {
    throw new Error(
      "Claid returned an empty task response."
    );
  }

  const taskResult =
    "data" in parsedResponse &&
    parsedResponse.data
      ? parsedResponse.data
      : parsedResponse as
          ClaidTaskResult;

  if (
    typeof taskResult.id !==
      "number" ||
    !taskResult.status
  ) {
    throw new Error(
      "Claid returned an invalid task result."
    );
  }

  return taskResult;
},

};
