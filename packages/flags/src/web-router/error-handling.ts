/**
 * Determines if an error should be handled gracefully by returning a default value
 * instead of throwing. This helps ensure flags don't break user applications.
 * @param error - The error to check
 * @returns True if the error should be handled gracefully
 */
export function isRecoverableError(error: unknown): boolean {
  // Network errors, timeout errors, and other recoverable errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('abort')
    );
  }

  return false;
}

/**
 * Safely executes a function and handles errors gracefully
 * @param fn - The function to execute
 * @param defaultValue - The default value to return on error
 * @param errorHandler - Optional error handler
 * @returns The result or default value
 */
export async function safeExecute<T>(
  fn: () => T | Promise<T>,
  defaultValue: T,
  errorHandler?: (error: unknown) => void,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (errorHandler) {
      errorHandler(error);
    }

    // Always return defaultValue when one is provided, regardless of error type
    if (defaultValue !== undefined) {
      return defaultValue;
    }

    throw error;
  }
}
