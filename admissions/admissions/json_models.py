import re
from enum import Enum
from typing import Dict, List, Literal, Self, Union
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, RootModel, model_validator
from typing_extensions import Annotated

"""
NOTE
These type definitions are connected to type TypeScript types defined in /frontend/src/utils/types
If you change one of them, make sure to change the other as well
"""


class DataType(str, Enum):
    TEXT = "text"
    TEXTINPUT = "textinput"
    TEXTAREA = "textarea"
    NUMBERINPUT = "numberinput"
    PHONEINPUT = "phoneinput"
    CHECKBOX = "checkbox"


####################################
##          INPUT MODELS          ##
####################################
class TextModel(BaseModel):
    model_config = ConfigDict(strict=True)

    type: Literal[DataType.TEXT]
    text: str


class BaseInputModel(BaseModel):
    model_config = ConfigDict(strict=True)

    id: str = Field(default_factory=lambda: uuid4().hex, min_length=1, frozen=True)
    title: str = Field(min_length=5)
    label: str
    placeholder: str
    required: bool


class TextInputModel(BaseInputModel):
    type: Literal[DataType.TEXTINPUT]


class TextAreaModel(BaseInputModel):
    type: Literal[DataType.TEXTAREA]


class NumberInputModel(BaseInputModel):
    type: Literal[DataType.NUMBERINPUT]


class PhoneInputModel(BaseInputModel):
    type: Literal[DataType.PHONEINPUT]


class CheckboxInputModel(BaseInputModel):
    type: Literal[DataType.CHECKBOX]


InputModelUnion = Union[
    TextModel,
    TextInputModel,
    TextAreaModel,
    NumberInputModel,
    PhoneInputModel,
    CheckboxInputModel,
]


class InputModelList(RootModel):
    root: List[Annotated[InputModelUnion, Field(discriminator="type")]]

    @model_validator(mode="after")
    def validate_unique_input_ids(self) -> Self:
        input_ids = [
            field.id for field in self.root if isinstance(field, BaseInputModel)
        ]
        if len(input_ids) != len(set(input_ids)):
            raise ValueError("Input field IDs must be unique")
        return self


####################################
##      INPUT RESPONSE MODEL      ##
####################################
class InputResponseModel(RootModel):
    root: Dict[str, Union[str, bool]]


####################################
##           VALIDATORS           ##
####################################
class Validator:
    def validate(self, model, value):
        pass


class PhoneNumberValidator(Validator):
    def validate(self, model, value):
        regex = r"^(0047|\+47|47)?(?:\s*\d){8}$"
        pattern = re.compile(regex)
        match = re.search(pattern, value)
        if not match:
            raise ValueError("Invalid UUID")


class CheckboxValidator(Validator):
    def validate(self, model, value):
        if not isinstance(value, bool):
            raise ValueError("Expected boolean value.")


validators = {
    DataType.PHONEINPUT: [PhoneNumberValidator],
    DataType.CHECKBOX: [CheckboxValidator],
}
