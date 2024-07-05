from urllib.parse import parse_qs

from .database import Database
from .directory import Directory


class ApiApp():
    def __init__(self, database: Database):
        self.database = database
        self.root = Directory(database=database, arche=True)

    def __call__(self, environ, start_response):
        raw_path = environ.get('PATH_INFO')

        if not raw_path or raw_path == '/':
            return self._bad_path_handler(start_response)

        request_body = environ.get("wsgi.input").read().decode("utf-8")
        d = parse_qs(request_body)

        if environ.get("REQUEST_METHOD") == "GET":
            default = object()
            result = self.root.get(raw_path.split("/"), default)
            if result is default:
                return self._data_not_found_handler(start_response)
            return self._response_handler(result, start_response)
        elif environ.get("REQUEST_METHOD") == "POST":
            try:
                value = d.get("value")[0]
            except TypeError:
                return self._bad_body_handler(start_response)
            comment = d.get("comment")
            comment = comment[0] if comment else None
            self.root.set(raw_path.split("/"), value, comment=comment)
            return self._response_handler("Success", start_response)

        else:
            return self._bad_method_handler(start_response)

    def _response_handler(self, data, start_response, status: str = '200 OK', content_type: str = 'text/plain'):
        data = data.encode()
        headers = [('Content-type', content_type)]
        start_response(status, headers)
        return [bytes(data)]

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
        return [b'Please specify value in the body to post to the directory.']

    def _bad_method_handler(self, start_response):
        status = '405 Method Not Allowed'
        headers = [('Content-type', 'text/plain')]
        start_response(status, headers)
        return [b'The Gink API only supports GET and POST.']


