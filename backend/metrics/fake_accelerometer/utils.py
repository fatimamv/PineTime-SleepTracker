from datetime import datetime

def date_parser(date_str):
    """
    Basic simulation of the date_parser function of the accelerometer package.
    Adjust the format according to the type of dates you are handling.
    """
    try:
        return datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        try:
            return datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            raise ValueError(f"Unsupported date format: {date_str}")