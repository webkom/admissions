from typing import List, Literal, Union
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, RootModel
from typing_extensions import Annotated

"""
NOTE
These type definitions are connected to type TypeScript types defined in /frontend/src/utils/types
If you change one of them, make sure to change the other as well
"""


####################################
##          INPUT MODELS          ##
####################################
class TextModel(BaseModel):
    model_config = ConfigDict(strict=True)

    type: Literal["text"]
    text: str


class BaseInputModel(BaseModel):
    model_config = ConfigDict(strict=True)

    id: str = Field(default_factory=lambda: uuid4().hex, frozen=True)
    title: str = Field(min_length=5)
    label: str
    placeholder: str
    required: bool


class TextInputModel(BaseInputModel):
    type: Literal["textinput"]


class TextAreaModel(BaseInputModel):
    type: Literal["textarea"]


class NumberInputModel(BaseInputModel):
    type: Literal["numberinput"]


class PhoneInputModel(BaseInputModel):
    type: Literal["phoneinput"]


InputModelUnion = Union[
    TextModel, TextInputModel, TextAreaModel, NumberInputModel, PhoneInputModel
]


class InputModelList(RootModel):
    root: List[Annotated[InputModelUnion, Field(discriminator="type")]]


#####################################
##      INPUT RESPONSE MODELS      ##
#####################################
class BaseInputResponseModel(BaseModel):
    model_config = ConfigDict(strict=True)

    input_id: str = Field(frozen=True)


class TextInputResponseModel(BaseInputResponseModel):
    value: str


class TextAreaResponseModel(BaseInputResponseModel):
    value: str


class NumberInputResponseModel(BaseInputResponseModel):
    value: str


class PhoneInputResponseModel(BaseInputResponseModel):
    value: str


InputResponseModelUnion = Union[
    TextInputResponseModel,
    TextAreaResponseModel,
    NumberInputResponseModel,
    PhoneInputResponseModel,
]


class ResponseModelList(RootModel):
    root: List[InputResponseModelUnion]
