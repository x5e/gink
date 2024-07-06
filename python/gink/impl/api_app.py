from json import loads, dumps
from json.decoder import JSONDecodeError

from .database import Database
from .directory import Directory


class ApiApp():
    """
    WSGI application to GET and POST data to a Gink database.

    Example for post:

    curl http://localhost:8099/key -d '{"value":3, "comment": "sent from curl"}' -H "Content-Type: application/json"

    # Sets key to 3 with a comment of "sent from curl"

    Example for get:

    curl -X GET http://localhost:8099/key

    # Returns 3

    """
    def __init__(self, database: Database, auth_token: str):
        self.database = database
        self.root = Directory(database=database, arche=True)
        self.auth_token = auth_token

    def __call__(self, environ, start_response):
        raw_path = environ.get('PATH_INFO')

        if not raw_path or raw_path == '/':
            return self._bad_path_handler(start_response)

        # If auth token is present, expect 'Bearer <token>' in the Authorization header.
        if self.auth_token:
            auth_header = environ.get('HTTP_AUTHORIZATION')
            if not auth_header or auth_header != f"Bearer {self.auth_token}":
                return self._bad_auth_handler(start_response)

        request_body = environ.get("wsgi.input").read().decode("utf-8")
        if request_body:
            try:
                d = loads(request_body)
            except JSONDecodeError: # Not valid JSON
                return self._bad_body_handler(start_response)

        if environ.get("REQUEST_METHOD") == "GET":
            default = object()
            result = self.root.get(raw_path.split("/"), default)
            if type(result) != bytes:
                data = dumps(data).encode()
            if result is default:
                return self._data_not_found_handler(start_response)
            return self._get_handler(result, start_response)

        elif environ.get("REQUEST_METHOD") == "POST":
            try:
                value = d["value"] # Expecting a body of { "value": "some value" } and an optional comment.
            except AttributeError:
                return self._bad_body_handler(start_response)

            content_type = environ.get("HTTP_CONTENT_TYPE")
            # application/json is handled by default
            if content_type == "text/plain":
                value = str(value)
            elif content_type == "application/octet-stream": # For binary data
                try:
                    value = bytes(value, "utf-8")
                except TypeError:
                    return self._bad_body_handler(start_response)

            comment = d.get("comment")
            self.root.set(raw_path.split("/"), value, comment=comment)
            return self._set_handler(start_response)

        else:
            return self._bad_method_handler(start_response)

    def _get_handler(self, data, start_response):
        """
        Default response handler to return gink data in JSON format.
        """
        status = '200 OK'
        headers = [('Content-type', 'application/json')]
        start_response(status, headers)
        return [bytes(data)]

    def _set_handler(self, start_response):
        status = '201 Created'
        headers = [('Content-type', 'text/plain')]
        start_response(status, headers)
        return [b'Entry created.']

    def _data_not_found_handler(self, start_response):
        status = '404 Not Found'
        headers = [('Content-type', 'text/plain')]
        start_response(status, headers)
        return [b'Entry not found.']

    def _bad_path_handler(self, start_response):
        status = '400 Bad Request'
        headers = [('Content-type', 'text/plain')]
        start_response(status, headers)
        return [b'Please specify a directory/key path.']

    def _bad_body_handler(self, start_response):
        status = '400 Bad Request'
        headers = [('Content-type', 'text/plain')]
        start_response(status, headers)
        return [b'Ensure body matches the content-type. If posting, please specify value in the body.']

    def _bad_method_handler(self, start_response):
        status = '405 Method Not Allowed'
        headers = [('Content-type', 'text/plain')]
        start_response(status, headers)
        return [b'The Gink API only supports GET and POST.']

    def _bad_auth_handler(self, start_response):
        status = '401 Unauthorized'
        headers = [('Content-type', 'text/plain')]
        start_response(status, headers)
        return [b'Bad auth token.']


