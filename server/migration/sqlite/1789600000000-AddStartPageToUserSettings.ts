import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStartPageToUserSettings1789600000000 implements MigrationInterface {
  name = 'AddStartPageToUserSettings1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "startPage" varchar`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "startPage"`
    );
  }
}
