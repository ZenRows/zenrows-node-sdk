import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

const handlers = [
  http.get("https://api.zenrows.com/v1/", () => {
    return HttpResponse.json({
      firstName: "John",
      lastName: "Maverick",
    });
  }),
  http.post("https://api.zenrows.com/v1/", () => {
    return new HttpResponse();
  }),
];

export const server = setupServer(...handlers);

beforeAll(() => {
  server.listen();
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
