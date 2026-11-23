interface Env {
  ROOMS: DurableObjectNamespace<import('./room.ts').DrawRoom>
  CREATE_LIMIT: RateLimit
  API_LIMIT: RateLimit
}
