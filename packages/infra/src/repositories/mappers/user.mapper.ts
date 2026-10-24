import type { UserData } from "@sentinel/application";
import type { UserInsert, UserSelect } from "../../db/schema/index.js";

export const UserMapper = {
  toDomain(row: UserSelect): UserData {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.passwordHash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  toInsert(user: UserData): UserInsert {
    return {
      id: user.id,
      username: user.username,
      passwordHash: user.passwordHash,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  },
};
