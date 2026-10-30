import request from "supertest";
import type { App } from "supertest/types";
import { TestApp } from "../support/app";
import {
  catalogueIds,
  createAdmin,
  createPendingBooking,
  createUser,
  expectProblem,
  hotelQuoteBody,
  isoDay,
  PREFIX,
  restoreSharedFixtures,
  setRoomFree,
  setTourFree,
  signIn,
  tourQuoteBody,
} from "../payments/support";

export {
  catalogueIds,
  createAdmin,
  createPendingBooking,
  createUser,
  expectProblem,
  hotelQuoteBody,
  isoDay,
  PREFIX,
  restoreSharedFixtures,
  setRoomFree,
  setTourFree,
  signIn,
  tourQuoteBody,
};

export function api(t: TestApp) {
  return request(t.app.getHttpServer() as App);
}

export const ADMIN = `${PREFIX}/admin`;

export function asAdmin(t: TestApp, token: string) {
  return {
    get: (path: string) => api(t).get(path).set("Authorization", `Bearer ${token}`),
    post: (path: string) => api(t).post(path).set("Authorization", `Bearer ${token}`),
    patch: (path: string) => api(t).patch(path).set("Authorization", `Bearer ${token}`),
    put: (path: string) => api(t).put(path).set("Authorization", `Bearer ${token}`),
    delete: (path: string) => api(t).delete(path).set("Authorization", `Bearer ${token}`),
  };
}
