import { PolyTagRepository } from "../src/repositories/polytagRepository.js";

const repository = new PolyTagRepository();

export default {
  async fetch() {
    try {
      await repository.healthCheck();
      return Response.json({ ok: true, service: "polytag-bot", database: "ready" });
    } catch (error) {
      console.error("Health check failed:", error);
      return Response.json(
        { ok: false, service: "polytag-bot", database: "error" },
        { status: 500 },
      );
    }
  },
};
