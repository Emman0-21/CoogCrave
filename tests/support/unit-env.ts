// Unit tests never touch a real database or network. Give config a valid, inert environment
// so modules that read it lazily behave predictably, and keep logs quiet.
process.env.APP_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = "postgresql://unit:unit@127.0.0.1:1/unit_tests_do_not_connect";
process.env.LOG_LEVEL = "silent";
