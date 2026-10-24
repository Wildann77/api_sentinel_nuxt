export interface UserData {
  readonly id: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UserRepositoryPort {
  getOwner(): Promise<UserData | null>;
  findById(id: string): Promise<UserData | null>;
  findByUsername(username: string): Promise<UserData | null>;
  createOwner(user: UserData, tx?: unknown): Promise<void>;
  updatePasswordHash(id: string, passwordHash: string, tx?: unknown): Promise<void>;
}
