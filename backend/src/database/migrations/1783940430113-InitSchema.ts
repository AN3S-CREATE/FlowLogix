import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1783940430113 implements MigrationInterface {
    name = 'InitSchema1783940430113'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "org_id" uuid NOT NULL, "email" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "first_name" character varying(100) NOT NULL, "last_name" character varying(100) NOT NULL, "avatar_url" character varying(2048), "timezone" character varying(100) NOT NULL DEFAULT 'UTC', "locale" character varying(20) NOT NULL DEFAULT 'en', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0a13270cd3101fd16b8000e00d" ON "users" ("org_id") `);
        await queryRunner.query(`CREATE TABLE "comments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "card_id" uuid NOT NULL, "user_id" uuid NOT NULL, "text_content" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8bf68bc960f2b69e818bdb90dcb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_93d9a3773334ccc328e38cec69" ON "comments" ("card_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_4c675567d2a58f0b07cef09c13" ON "comments" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "card_members" ("card_id" uuid NOT NULL, "user_id" uuid NOT NULL, CONSTRAINT "PK_bed6ed9a20dc925074c9f31770b" PRIMARY KEY ("card_id", "user_id"))`);
        await queryRunner.query(`CREATE TABLE "cards" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "list_id" uuid NOT NULL, "title" character varying(255) NOT NULL, "description" text, "position_idx" double precision NOT NULL, "due_date" TIMESTAMP WITH TIME ZONE, "is_complete" boolean NOT NULL DEFAULT false, "is_archived" boolean NOT NULL DEFAULT false, "custom_fields" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5f3269634705fdff4a9935860fc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2d636e34938aee366ba98cf1fe" ON "cards" ("list_id") `);
        await queryRunner.query(`CREATE TABLE "lists" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "board_id" uuid NOT NULL, "title" character varying(255) NOT NULL, "position_idx" double precision NOT NULL, "is_archived" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_268b525e9a6dd04d0685cb2aaaa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_df6934914bb17e5783e6850a85" ON "lists" ("board_id") `);
        await queryRunner.query(`CREATE TYPE "public"."board_member_role" AS ENUM('owner', 'admin', 'member', 'viewer')`);
        await queryRunner.query(`CREATE TABLE "board_members" ("board_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" "public"."board_member_role" NOT NULL DEFAULT 'member', "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_159415b4beacf33c9393cfe673c" PRIMARY KEY ("board_id", "user_id"))`);
        await queryRunner.query(`CREATE TYPE "public"."board_visibility" AS ENUM('private', 'org', 'public')`);
        await queryRunner.query(`CREATE TABLE "boards" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "org_id" uuid NOT NULL, "title" character varying(255) NOT NULL, "description" text, "visibility" "public"."board_visibility" NOT NULL DEFAULT 'private', "bg_properties" jsonb NOT NULL DEFAULT '{}', "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_606923b0b068ef262dfdcd18f44" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fe7da6d76715cbcca7fc752493" ON "boards" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_8156e1b3bd94cb1812a6d55375" ON "boards" ("created_by") `);
        await queryRunner.query(`CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(255) NOT NULL, "domain" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_98678ed828cc71e4f8a58c95d6b" UNIQUE ("domain"), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_0a13270cd3101fd16b8000e00d4" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comments" ADD CONSTRAINT "FK_93d9a3773334ccc328e38cec696" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comments" ADD CONSTRAINT "FK_4c675567d2a58f0b07cef09c13d" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "card_members" ADD CONSTRAINT "FK_91d9d13efafaef543a98f9dcca8" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "card_members" ADD CONSTRAINT "FK_43bb5dc535ca4a9abe75e7a3466" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cards" ADD CONSTRAINT "FK_2d636e34938aee366ba98cf1fe9" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lists" ADD CONSTRAINT "FK_df6934914bb17e5783e6850a854" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "board_members" ADD CONSTRAINT "FK_ca2c72a39c80199717012df3932" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "board_members" ADD CONSTRAINT "FK_a9989bac63c51805e59ce91a541" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "boards" ADD CONSTRAINT "FK_fe7da6d76715cbcca7fc7524932" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "boards" ADD CONSTRAINT "FK_8156e1b3bd94cb1812a6d55375c" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "boards" DROP CONSTRAINT "FK_8156e1b3bd94cb1812a6d55375c"`);
        await queryRunner.query(`ALTER TABLE "boards" DROP CONSTRAINT "FK_fe7da6d76715cbcca7fc7524932"`);
        await queryRunner.query(`ALTER TABLE "board_members" DROP CONSTRAINT "FK_a9989bac63c51805e59ce91a541"`);
        await queryRunner.query(`ALTER TABLE "board_members" DROP CONSTRAINT "FK_ca2c72a39c80199717012df3932"`);
        await queryRunner.query(`ALTER TABLE "lists" DROP CONSTRAINT "FK_df6934914bb17e5783e6850a854"`);
        await queryRunner.query(`ALTER TABLE "cards" DROP CONSTRAINT "FK_2d636e34938aee366ba98cf1fe9"`);
        await queryRunner.query(`ALTER TABLE "card_members" DROP CONSTRAINT "FK_43bb5dc535ca4a9abe75e7a3466"`);
        await queryRunner.query(`ALTER TABLE "card_members" DROP CONSTRAINT "FK_91d9d13efafaef543a98f9dcca8"`);
        await queryRunner.query(`ALTER TABLE "comments" DROP CONSTRAINT "FK_4c675567d2a58f0b07cef09c13d"`);
        await queryRunner.query(`ALTER TABLE "comments" DROP CONSTRAINT "FK_93d9a3773334ccc328e38cec696"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_0a13270cd3101fd16b8000e00d4"`);
        await queryRunner.query(`DROP TABLE "organizations"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8156e1b3bd94cb1812a6d55375"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fe7da6d76715cbcca7fc752493"`);
        await queryRunner.query(`DROP TABLE "boards"`);
        await queryRunner.query(`DROP TYPE "public"."board_visibility"`);
        await queryRunner.query(`DROP TABLE "board_members"`);
        await queryRunner.query(`DROP TYPE "public"."board_member_role"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_df6934914bb17e5783e6850a85"`);
        await queryRunner.query(`DROP TABLE "lists"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2d636e34938aee366ba98cf1fe"`);
        await queryRunner.query(`DROP TABLE "cards"`);
        await queryRunner.query(`DROP TABLE "card_members"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4c675567d2a58f0b07cef09c13"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_93d9a3773334ccc328e38cec69"`);
        await queryRunner.query(`DROP TABLE "comments"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0a13270cd3101fd16b8000e00d"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
