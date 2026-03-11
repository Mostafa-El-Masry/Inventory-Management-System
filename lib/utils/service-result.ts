export type ServiceResult<T> =
  | {
      ok: true;
      status: number;
      data: T;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export function serviceOk<T>(data: T, status = 200): ServiceResult<T> {
  return {
    ok: true,
    status,
    data,
  };
}

export function serviceFail(status: number, error: string): ServiceResult<never> {
  return {
    ok: false,
    status,
    error,
  };
}
