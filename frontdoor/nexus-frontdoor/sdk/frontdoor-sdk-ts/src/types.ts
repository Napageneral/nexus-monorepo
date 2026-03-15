import type { operations } from "./generated/schema.js";

type EmptyObject = Record<never, never>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type NonNever<T, Fallback = EmptyObject> = [T] extends [never] ? Fallback : T;

type ParametersOf<T> = [T] extends [{ parameters: infer P }] ? P : EmptyObject;
type RequestBodyOf<T> = [T] extends [{ requestBody: { content: { "application/json": infer Body } } }]
  ? NonNever<Body>
  : [T] extends [{ requestBody?: { content: { "application/json": infer OptionalBody } } }]
    ? NonNever<OptionalBody>
    : EmptyObject;

type SuccessStatus = 200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 226;

type ResponseContentOf<T> = {
  [K in keyof T & SuccessStatus]: [T[K]] extends [{ content: { "application/json": infer Content } }]
    ? Content
    : never;
}[keyof T & SuccessStatus];

type PathParamsOf<T> = [ParametersOf<T>] extends [{ path?: infer Path }] ? NonNever<Path> : EmptyObject;
type QueryParamsOf<T> = [ParametersOf<T>] extends [{ query?: infer Query }] ? NonNever<Query> : EmptyObject;
type HeaderParamsOf<T> = [ParametersOf<T>] extends [{ header?: infer Header }] ? NonNever<Header> : EmptyObject;
type CookieParamsOf<T> = [ParametersOf<T>] extends [{ cookie?: infer Cookie }] ? NonNever<Cookie> : EmptyObject;

export type RequestOf<T> = Simplify<
  PathParamsOf<T> & QueryParamsOf<T> & HeaderParamsOf<T> & CookieParamsOf<T> & RequestBodyOf<T>
>;

export type ResponseOf<T> = [T] extends [{ responses: infer Responses }] ? ResponseContentOf<Responses> : never;

export type OperationRequest<OperationId extends keyof operations> = RequestOf<operations[OperationId]>;
export type OperationResponse<OperationId extends keyof operations> = ResponseOf<operations[OperationId]>;
