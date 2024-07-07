"""
The WSGI API application for gink operations.

To run this application, pass --wsgi gink.crud.app when starting gink.

Set auth key with env AUTH_TOKEN.

"""

from json import loads, dumps
from os import environ

from .impl.directory import Directory


class Crud():
    """
    WSGI application to GET and PUT data from/in a Gink database.

    Example for PUT:

    curl -X PUT http://localhost:8099/key -d 3 -H "Content-Type: application/json"

    # Sets "key" in root directory to 3

    Example for GET:

    curl -X GET http://localhost:8099/key

    # Returns 3

    """
    def __init__(self):
        self.root = Directory(arche=True)
        self.auth_token = environ.get("AUTH_TOKEN")

    def __call__(self, environ, start_response):
        # If auth token is present, expect token in the Authorization header.
        if self.auth_token:
            auth_header = environ.get('HTTP_AUTHORIZATION')
            if not auth_header or self.auth_token not in auth_header:
                return self._bad_auth_handler(start_response)

        raw_path = environ.get('PATH_INFO')
        if not raw_path or raw_path == '/':
            return self._bad_path_handler(start_response)

        if environ.get("REQUEST_METHOD") == "GET":
            default = object()
            result = self.root.get(raw_path.split("/"), default)
            if result is default:
                return self._data_not_found_handler(start_response)
            return self._get_handler(result, start_response)

        elif environ.get("REQUEST_METHOD") == "PUT":
            request_body: bytes = environ.get("wsgi.input").read()
            if not request_body:
                return self._bad_body_handler(start_response)

            content_type = environ.get("HTTP_CONTENT_TYPE")
            if content_type == "application/octet-stream" or content_type == "application/x-www-form-urlencoded":
                value = request_body # Default to binary
            elif content_type == "text/plain":
                value = request_body.decode()
            elif content_type == "application/json":
                value = loads(request_body.decode())
            else:
                return self._bad_type_handler(start_response)

            self.root.set(raw_path.split("/"), value)
            return self._set_handler(start_response)

        # elif environ.get("REQUEST_METHOD") == "DELETE":
            # deleted = bool(self.root.delete(raw_path.split("/")))
            # if not deleted:
            #     return self._data_not_found_handler(start_response)
            # return self._delete_handler(start_response)

        else:
            return self._bad_method_handler(start_response)

    def _get_handler(self, data, start_response):
        """
        Default response handler to return gink data in JSON format.
        """
        status = '200 OK'
        if type(data) == str:
            content_type = "text/plain"
            data = data.encode()
        if type(data) == bytes:
            content_type = "application/octet-stream"
        else:
            content_type = 'application/json'
            data = dumps(data).encode()

        headers = [('Content-type', content_type)]
        start_response(status, headers)
        assert type(data) == bytes, "data isn't bytes?"
        return [data]

    def _set_handler(self, start_response):
        status = '201 Created'
        headers = [('Content-type', 'text/plain')]
        start_response(status, headers)
        return [b'Entry updated or created.']

    # def _delete_handler(self, start_response):
    #     status = '200 OK'
    #     headers = [('Content-type', 'text/plain')]
    #     start_response(status, headers)
    #     return [b'Entry deleted.']

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

    def _bad_type_handler(self, start_response):
        status = '400 Bad Request'
        headers = [('Content-type', 'text/plain')]
        start_response(status, headers)
        return [b'Content type must be text/plain, application/json, application/octet-stream, or application/x-www-form-urlencoded']

    def _bad_body_handler(self, start_response):
        status = '400 Bad Request'
        headers = [('Content-type', 'text/plain')]
        start_response(status, headers)
        return [b'Ensure body matches the content-type. If posting, the value is the request body.']

    def _bad_method_handler(self, start_response):
        status = '405 Method Not Allowed'
        headers = [('Content-type', 'text/plain')]
        start_response(status, headers)
        return [b'The Gink API supports GET and PUT.']

    def _bad_auth_handler(self, start_response):
        status = '401 Unauthorized'
        headers = [('Content-type', 'text/plain')]
        start_response(status, headers)
        return [b'Bad auth token.']

app = Crud()
