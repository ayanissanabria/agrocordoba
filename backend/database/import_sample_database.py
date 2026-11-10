"""Import the synthetic SQLite fixture into an empty PostgreSQL database."""

import argparse
import os
import sys
from pathlib import Path

from sqlalchemy import Integer, MetaData, create_engine, func, insert, select, text

BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(__file__).resolve().parent / "agrocordoba_sample.db"
sys.path.insert(0, str(BACKEND_ROOT))

from app import app, db  # noqa: E402


def import_sample_database(source_path, database_url):
    source_path = Path(source_path).resolve()
    if not source_path.is_file():
        raise FileNotFoundError(f"Fixture database not found: {source_path}")
    if not database_url:
        raise RuntimeError("Set DATABASE_URL to the destination PostgreSQL database.")

    with app.app_context():
        if db.engine.dialect.name != "postgresql":
            raise RuntimeError(
                "The fixture importer only supports PostgreSQL destinations."
            )

        source_engine = create_engine(f"sqlite:///{source_path.as_posix()}")
        try:
            with source_engine.connect() as source_connection:
                source_metadata = MetaData()
                source_metadata.reflect(bind=source_connection)
                source_tables = source_metadata.tables
                target_tables = db.metadata.tables

                unknown_tables = sorted(set(source_tables) - set(target_tables))
                if unknown_tables:
                    raise RuntimeError(
                        "Fixture contains tables not present in the application schema: "
                        + ", ".join(unknown_tables)
                    )

                fixture_rows = {}
                for table in db.metadata.sorted_tables:
                    source_table = source_tables.get(table.name)
                    if source_table is None:
                        continue
                    unknown_columns = sorted(
                        set(source_table.columns.keys()) - set(table.columns.keys())
                    )
                    if unknown_columns:
                        raise RuntimeError(
                            f"Fixture table {table.name} has unknown columns: "
                            + ", ".join(unknown_columns)
                        )
                    fixture_rows[table.name] = source_connection.execute(
                        select(source_table)
                    ).mappings().all()

            with db.engine.begin() as destination_connection:
                populated_tables = []
                for table in db.metadata.sorted_tables:
                    count = destination_connection.execute(
                        select(func.count()).select_from(table)
                    ).scalar_one()
                    if count:
                        populated_tables.append(f"{table.name} ({count})")
                if populated_tables:
                    raise RuntimeError(
                        "Refusing to import fixtures into a non-empty database: "
                        + ", ".join(populated_tables)
                        + ". Back up the database and migrate into a clean database."
                    )

                for table in db.metadata.sorted_tables:
                    rows = fixture_rows.get(table.name, [])
                    if rows:
                        destination_connection.execute(
                            insert(table), [dict(row) for row in rows]
                        )

                _reset_postgresql_sequences(destination_connection)

            return {
                table.name: len(fixture_rows.get(table.name, []))
                for table in db.metadata.sorted_tables
            }
        finally:
            source_engine.dispose()


def _reset_postgresql_sequences(connection):
    for table in db.metadata.sorted_tables:
        for column in table.primary_key.columns:
            if not isinstance(column.type, Integer) or column.autoincrement is False:
                continue
            sequence_name = connection.execute(
                text("SELECT pg_get_serial_sequence(:table_name, :column_name)"),
                {"table_name": table.name, "column_name": column.name},
            ).scalar_one_or_none()
            if sequence_name is None:
                continue
            highest_id = connection.execute(
                select(func.max(column)).select_from(table)
            ).scalar_one()
            if highest_id is not None:
                connection.execute(
                    text(
                        "SELECT setval(CAST(:sequence_name AS regclass), :highest_id, true)"
                    ),
                    {"sequence_name": sequence_name, "highest_id": highest_id},
                )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help="Path to the SQLite fixture database.",
    )
    args = parser.parse_args()
    counts = import_sample_database(args.source, os.environ.get("DATABASE_URL", ""))
    print(f"Imported fixture from {args.source.resolve()}:")
    for table_name, count in counts.items():
        print(f"  {table_name}: {count}")


if __name__ == "__main__":
    main()
