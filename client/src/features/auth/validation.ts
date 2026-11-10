import { ApiError } from '@/lib/api'

type FieldErrors = Record<string, string[] | undefined>
type ValidationDetails = { fieldErrors: FieldErrors }

function isValidationDetails(value: unknown): value is ValidationDetails {
  return typeof value === 'object' && value !== null && 'fieldErrors' in value
}

export function getFieldErrors(error: unknown): FieldErrors {
  if (error instanceof ApiError && error.code === 'VALIDATION_ERROR' && isValidationDetails(error.details)) {
    return error.details.fieldErrors
  }
  return {}
}

export function getErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
}
