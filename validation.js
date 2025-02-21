const Joi = require('joi');

const imageSchema = Joi.object({
  image: Joi.string()
    .base64()
    .required()
    .messages({
      'string.base64': 'Invalid base64 format',
      'any.required': 'Image is required'
    })
});

exports.validateImageInput = (image) => {
  const { error } = imageSchema.validate({ image });
  return error === undefined;
};