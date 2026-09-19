import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFeedDaysToUserSettings1789700000000 implements MigrationInterface {
  name = 'AddFeedDaysToUserSettings1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "feedDays" integer`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "feedDays"`
    );
  }
}
