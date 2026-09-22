import os
import sys
import json
import requests
from dotenv import load_dotenv

load_dotenv()


class BookNotFoundError(Exception):
    pass


class GoogleBooksSource:
    BASE_URL = "https://www.googleapis.com/books/v1/volumes"

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ.get("GOOGLE_BOOKS_API_KEY")

    def get_book(self, isbn: str) -> dict | None:
        params = {"q": f"isbn:{isbn}"}

        if self.api_key:
            params["key"] = self.api_key

        response = requests.get(
            self.BASE_URL,
            params=params,
            timeout=10
        )

        if response.status_code != 200:
            return None

        data = response.json()

        if data.get("totalItems", 0) == 0:
            return None

        info = data["items"][0]["volumeInfo"]

        return {
            "title": info.get("title"),
            "authors": info.get("authors", [])
        }


class OpenLibrarySource:
    BASE_URL = "https://openlibrary.org/api/books"

    def get_book(self, isbn: str) -> dict | None:
        params = {
            "bibkeys": f"ISBN:{isbn}",
            "format": "json",
            "jscmd": "data"
        }

        response = requests.get(
            self.BASE_URL,
            params=params,
            timeout=10
        )

        if response.status_code != 200:
            return None

        data = response.json()

        entry = data.get(f"ISBN:{isbn}")

        if entry is None:
            return None

        return {
            "title": entry.get("title"),
            "authors": [
                a["name"]
                for a in entry.get("authors", [])
            ]
        }


class BookLookup:
    def __init__(self, sources: list | None = None):
        self.sources = sources or [
            OpenLibrarySource(),
            GoogleBooksSource()
        ]

    def get_book(self, isbn: str) -> dict:
        for source in self.sources:
            book = source.get_book(isbn)

            if book is not None:
                return book

        raise BookNotFoundError(
            f"Aucun livre trouvé pour l'ISBN {isbn} "
            "dans les sources disponibles"
        )


def main():
    if len(sys.argv) != 2:
        print(json.dumps({
            "error": "Usage : python code.py <isbn>"
        }, ensure_ascii=False))
        sys.exit(1)

    isbn = sys.argv[1]

    lookup = BookLookup()

    try:
        book = lookup.get_book(isbn)

        print(json.dumps(book, ensure_ascii=False))

    except BookNotFoundError as error:
        print(json.dumps({
            "error": str(error)
        }, ensure_ascii=False))

        sys.exit(1)


if __name__ == "__main__":
    main()